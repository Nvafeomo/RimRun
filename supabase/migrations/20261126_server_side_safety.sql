-- RimRun: server-side safety and abuse protection.
--
-- NOT YET APPLIED. Before running this in the Supabase SQL editor, run
-- supabase/audit/security_audit.sql and review the results, since most of the
-- live schema is not tracked in this repo. Safe to re-run
-- (CREATE OR REPLACE / DROP IF EXISTS).
--
-- 1-5: friend-only DMs, the age matrix, blocks, protected profile fields,
--      rate-limit bucket hardening.
-- 6:   anti-spam limits on messages and friend requests.
-- 7:   username sign-in that only reveals the email to someone with the password.
--
-- Mirrors lib/agePolicy.ts:
--   * 13-17 with 13-17: partner within 3 years (floor 13)
--   * adult with minor: the adult must be a verified professional
--   * adult with adult: allowed
--   * either user blocked the other: never allowed

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) One server-side answer to "may these two users interact?"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rimrun_users_can_interact(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dob_a date;
  v_dob_b date;
  v_pro_a boolean;
  v_pro_b boolean;
  v_age_a integer;
  v_age_b integer;
BEGIN
  IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)
  ) THEN
    RETURN false;
  END IF;

  -- verified_professional is read through jsonb so this works before that column exists.
  SELECT p.date_of_birth::date, coalesce((to_jsonb(p) ->> 'verified_professional')::boolean, false)
    INTO v_dob_a, v_pro_a
  FROM public.profiles p WHERE p.id = p_user_a;

  SELECT p.date_of_birth::date, coalesce((to_jsonb(p) ->> 'verified_professional')::boolean, false)
    INTO v_dob_b, v_pro_b
  FROM public.profiles p WHERE p.id = p_user_b;

  IF v_dob_a IS NULL OR v_dob_b IS NULL THEN
    RETURN false;
  END IF;

  v_age_a := date_part('year', age(current_date, v_dob_a))::integer;
  v_age_b := date_part('year', age(current_date, v_dob_b))::integer;

  IF v_age_a < 13 OR v_age_b < 13 THEN
    RETURN false;
  END IF;

  IF v_age_a <= 17 AND v_age_b <= 17 THEN
    RETURN abs(v_age_a - v_age_b) <= 3;
  END IF;

  IF v_age_a <= 17 THEN
    RETURN v_pro_b;
  END IF;

  IF v_age_b <= 17 THEN
    RETURN v_pro_a;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rimrun_users_can_interact(uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.rimrun_users_can_interact(uuid, uuid) IS
  'Blocks + age matrix (lib/agePolicy.ts). Internal: called by policies and RPCs only.';

-- Caller-scoped wrapper for RLS policies: only answers for the signed-in user,
-- so clients cannot probe arbitrary pairs of users.
CREATE OR REPLACE FUNCTION public.rimrun_i_can_interact_with(p_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rimrun_users_can_interact(auth.uid(), p_other_user_id);
$$;

REVOKE ALL ON FUNCTION public.rimrun_i_can_interact_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rimrun_i_can_interact_with(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Clients cannot change safety fields on their own profile
--    (date of birth after it is set, verified_professional, chat suspension).
--    Server functions (SECURITY DEFINER) and the service role are unaffected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_protect_safety_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_new ? 'verified_professional' THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('verified_professional', false));
    END IF;
    IF v_new ? 'chat_suspended_until' THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object('chat_suspended_until', null));
    END IF;
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);

  IF v_old ->> 'date_of_birth' IS NOT NULL
     AND v_new -> 'date_of_birth' IS DISTINCT FROM v_old -> 'date_of_birth' THEN
    RAISE EXCEPTION 'Date of birth cannot be changed. Contact support.'
      USING ERRCODE = '42501';
  END IF;

  IF v_new -> 'verified_professional' IS DISTINCT FROM v_old -> 'verified_professional' THEN
    RAISE EXCEPTION 'verified_professional is set by RimRun staff only'
      USING ERRCODE = '42501';
  END IF;

  IF v_new -> 'chat_suspended_until' IS DISTINCT FROM v_old -> 'chat_suspended_until' THEN
    RAISE EXCEPTION 'Chat suspensions cannot be changed by clients'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_safety_fields ON public.profiles;
CREATE TRIGGER trg_profiles_protect_safety_fields
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.profiles_protect_safety_fields();

-- ---------------------------------------------------------------------------
-- 3) DMs: only between friends who pass the age/block check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_dm_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_conv_id uuid;
  v_user_a uuid;
  v_user_b uuid;
BEGIN
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.is_user_banned(v_my_id) THEN
    RAISE EXCEPTION 'Account suspended';
  END IF;
  IF p_other_user_id IS NULL OR v_my_id = p_other_user_id THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_id = v_my_id AND friend_id = p_other_user_id
  ) THEN
    RAISE EXCEPTION 'You can only message friends.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.rimrun_users_can_interact(v_my_id, p_other_user_id) THEN
    RAISE EXCEPTION 'You cannot message this user.' USING ERRCODE = '42501';
  END IF;

  v_user_a := least(v_my_id, p_other_user_id);
  v_user_b := greatest(v_my_id, p_other_user_id);

  SELECT c.id INTO v_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1
    ON cp1.conversation_id = c.id AND cp1.user_id = v_user_a
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = c.id AND cp2.user_id = v_user_b
  WHERE c.type = 'dm'
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (type) VALUES ('dm') RETURNING id INTO v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_user_a);
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_user_b);
  END IF;

  RETURN v_conv_id;
END;
$$;

-- Sending into an existing DM: the other person must still be a friend who
-- passes the check (covers unfriending, blocking, and old conversations).
CREATE OR REPLACE FUNCTION public.rimrun_dm_send_allowed(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT c.type FROM public.conversations c WHERE c.id = p_conversation_id) IS DISTINCT FROM 'dm'
      THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.conversation_participants other
      JOIN public.friendships f
        ON f.user_id = auth.uid() AND f.friend_id = other.user_id
      WHERE other.conversation_id = p_conversation_id
        AND other.user_id <> auth.uid()
        AND public.rimrun_users_can_interact(auth.uid(), other.user_id)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.rimrun_dm_send_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rimrun_dm_send_allowed(uuid) TO authenticated;

DROP POLICY IF EXISTS "Send message if in conversation" ON public.messages;
CREATE POLICY "Send message if in conversation"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND NOT public.current_user_is_banned()
    AND NOT public.user_chat_is_suspended((SELECT auth.uid()))
    AND public.rimrun_dm_send_allowed(messages.conversation_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = messages.conversation_id
          AND cp.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.conversations c
        JOIN public.court_subscriptions cs
          ON cs.court_id = c.court_id
         AND cs.user_id = (SELECT auth.uid())
        WHERE c.id = messages.conversation_id
          AND c.type = 'court'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Friend requests: same check when sending (direct insert) and accepting
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert friend requests as sender" ON public.friend_requests;
CREATE POLICY "Users can insert friend requests as sender"
  ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND NOT public.current_user_is_banned()
    AND public.rimrun_i_can_interact_with(receiver_id)
  );

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id uuid := auth.uid();
  v_sender_id uuid;
BEGIN
  IF v_receiver_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.is_user_banned(v_receiver_id) THEN
    RAISE EXCEPTION 'Account suspended';
  END IF;

  SELECT sender_id INTO v_sender_id
  FROM public.friend_requests
  WHERE id = p_request_id
    AND receiver_id = v_receiver_id
    AND status = 'pending';

  IF v_sender_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.rimrun_users_can_interact(v_receiver_id, v_sender_id) THEN
    RAISE EXCEPTION 'You cannot add this user as a friend.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.friend_requests SET status = 'accepted' WHERE id = p_request_id;

  INSERT INTO public.friendships (user_id, friend_id) VALUES (v_receiver_id, v_sender_id);
  INSERT INTO public.friendships (user_id, friend_id) VALUES (v_sender_id, v_receiver_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Rate limiting: clients cannot fill up other users' limit buckets
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit(text, integer, integer) FROM authenticated;

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_bucket_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event text;
  v_key text;
BEGIN
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'log_security_event: event_type required';
  END IF;

  v_event := left(trim(p_event_type), 64);
  -- The limit bucket is always namespaced to the caller; the client-supplied
  -- key is stored for context only.
  v_key := 'security_log:' || v_event || ':' || coalesce(v_uid::text, 'anon');
  PERFORM public.enforce_rate_limit(v_key, 30, 3600);

  INSERT INTO public.security_audit_log (event_type, actor_id, bucket_key, metadata)
  VALUES (v_event, v_uid, left(coalesce(p_bucket_key, ''), 256), coalesce(p_metadata, '{}'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Anti-spam: per-user limits on direct client writes. Server functions
--    (SECURITY DEFINER) run as the owner and are not limited here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rimrun_limit_client_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  -- TG_ARGV: action name, max attempts, window in seconds
  PERFORM public.enforce_user_rate_limit(TG_ARGV[0], TG_ARGV[1]::integer, TG_ARGV[2]::integer);
  RETURN NEW;
END;
$$;

-- 30 messages a minute and 600 an hour per user is far above normal chatting.
DROP TRIGGER IF EXISTS trg_messages_rate_limit_minute ON public.messages;
CREATE TRIGGER trg_messages_rate_limit_minute
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.rimrun_limit_client_writes('send_message_minute', '30', '60');

DROP TRIGGER IF EXISTS trg_messages_rate_limit_hour ON public.messages;
CREATE TRIGGER trg_messages_rate_limit_hour
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.rimrun_limit_client_writes('send_message_hour', '600', '3600');

DROP TRIGGER IF EXISTS trg_friend_requests_rate_limit ON public.friend_requests;
CREATE TRIGGER trg_friend_requests_rate_limit
  BEFORE INSERT ON public.friend_requests
  FOR EACH ROW
  EXECUTE PROCEDURE public.rimrun_limit_client_writes('friend_request_insert', '20', '3600');

-- ---------------------------------------------------------------------------
-- 7) Username sign-in without exposing emails.
--    lookup_login_email(username) returns any user's email to anyone. This
--    version returns it only when the password is also correct, so it reveals
--    nothing an attacker could not already get by logging in. Limited to 10
--    attempts per username per 15 minutes.
--    Once every app build uses this, revoke the old function:
--      REVOKE EXECUTE ON FUNCTION public.lookup_login_email(text) FROM anon, authenticated;
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.lookup_login_email_verified(p_username text, p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_username text := lower(trim(coalesce(p_username, '')));
  v_email text;
  v_hash text;
BEGIN
  IF v_username = '' OR length(v_username) > 64
     OR p_password IS NULL OR length(p_password) = 0 OR length(p_password) > 256 THEN
    RETURN NULL;
  END IF;

  PERFORM public.enforce_rate_limit('login_lookup:' || v_username, 10, 900);

  SELECT u.email, u.encrypted_password
    INTO v_email, v_hash
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(p.username) = v_username
  LIMIT 1;

  IF v_hash IS NULL OR v_hash = '' THEN
    RETURN NULL;
  END IF;

  IF extensions.crypt(p_password, v_hash) = v_hash THEN
    RETURN v_email;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_login_email_verified(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_login_email_verified(text, text) TO anon, authenticated;

COMMIT;
