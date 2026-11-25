-- Tests for supabase/migrations/20261125_abuse_limits.sql. See README.md.
-- Any failure raises an exception; run with ON_ERROR_STOP=1.
\set ON_ERROR_STOP 1
\set QUIET 1

-- A SECURITY DEFINER RPC like the live ones, to prove they keep working.
CREATE FUNCTION public.test_definer_rpc() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.enforce_user_rate_limit('test_rpc', 5, 60); END; $$;
GRANT EXECUTE ON FUNCTION public.test_definer_rpc() TO authenticated;

-- Signed in as user A for everything below unless noted.
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

DO $$ BEGIN
  BEGIN
    PERFORM public.enforce_rate_limit('send_friend_request:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 100000, 60);
    RAISE EXCEPTION 'FAIL 1: client called enforce_rate_limit on another user''s bucket';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS 1: enforce_rate_limit not callable by clients';
  END;
END $$;

DO $$ BEGIN
  BEGIN
    PERFORM public.enforce_user_rate_limit('anything', 100000, 60);
    RAISE EXCEPTION 'FAIL 2: client called enforce_user_rate_limit directly';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS 2: enforce_user_rate_limit not callable by clients';
  END;
END $$;

DO $$ BEGIN
  PERFORM public.test_definer_rpc();
  RAISE NOTICE 'PASS 3: SECURITY DEFINER RPCs can still rate limit';
END $$;

-- One event naming another user's bucket; checked as test 10 below.
DO $$ BEGIN
  PERFORM public.log_security_event('auth_sign_in_failed',
    'send_friend_request:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '{}');
END $$;

DO $$
DECLARE i int;
BEGIN
  -- 29 more events (30 in total) with a different client key each time: all allowed ...
  FOR i IN 1..29 LOOP
    PERFORM public.log_security_event('auth_sign_in_failed', 'rotating:' || i, '{"reason":"x"}');
  END LOOP;
  -- ... but the 31st is stopped, because the key is per user, not per client string.
  BEGIN
    PERFORM public.log_security_event('auth_sign_in_failed', 'rotating:31', '{}');
    RAISE EXCEPTION 'FAIL 4: rotating client keys bypassed the 30/hour cap';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'rate_limit:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 4: log_security_event capped per user (30/hour)';
  END;
END $$;

DO $$
BEGIN
  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), repeat('a', 4000));
  RAISE NOTICE 'PASS 5: 4000-character message accepted';
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), repeat('a', 4001));
    RAISE EXCEPTION 'FAIL 6: 4001-character message accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 6: over-length message rejected';
  END;
END $$;

DO $$
DECLARE i int; sent int := 1; -- the 4000-character message above counts
BEGIN
  BEGIN
    FOR i IN 1..100 LOOP
      INSERT INTO public.messages (conversation_id, sender_id, content)
      VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), 'hi ' || i);
      sent := sent + 1;
    END LOOP;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'rate_limit:%' THEN RAISE; END IF;
  END;
  IF sent <> 60 THEN
    RAISE EXCEPTION 'FAIL 7: expected 60 messages per minute, sent %', sent;
  END IF;
  RAISE NOTICE 'PASS 7: 60 messages/minute allowed, 61st rejected';
END $$;

-- User B is not affected by A hitting the limit.
SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $$ BEGIN
  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', auth.uid(), 'hello');
  RAISE NOTICE 'PASS 8: other users can still send';
END $$;

-- Friendship rows cannot be forged directly (accept_friend_request makes them).
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN
  BEGIN
    INSERT INTO public.friendships (user_id, friend_id)
    VALUES (auth.uid(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'FAIL 9: user inserted a friendship row without consent';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS 9: direct friendship insert blocked by RLS';
  END;
END $$;

-- Back to the table owner (like the SQL editor): no user, no limits.
RESET ROLE;
SET request.jwt.claim.sub = '';
DO $$ DECLARE k text; BEGIN
  SELECT bucket_key INTO k FROM public.security_audit_log ORDER BY id LIMIT 1;
  IF k IS DISTINCT FROM 'security_event:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' THEN
    RAISE EXCEPTION 'FAIL 10: audit bucket key was client-chosen: %', k;
  END IF;
  RAISE NOTICE 'PASS 10: audit log bucket key derived server-side';
END $$;

DO $$ BEGIN
  INSERT INTO public.messages (conversation_id, sender_id, content)
  SELECT 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin ' || g
  FROM generate_series(1, 100) g;
  RAISE NOTICE 'PASS 11: server-side inserts without a user are not rate limited';
END $$;

\echo ALL TESTS PASSED
