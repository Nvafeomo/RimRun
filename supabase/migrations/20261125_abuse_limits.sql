-- PROPOSAL (security-proposals branch): server-side abuse limits.
-- Review, run the local test (supabase/tests/README.md), then paste into the
-- Supabase SQL Editor. Every statement is safe to re-run.
--
-- 1) Clients can no longer call the raw rate-limit helpers directly. Today any
--    signed-in user can call enforce_rate_limit('send_friend_request:<victim>', ...)
--    and fill someone else's bucket, locking them out of that action, or pick a
--    huge limit and write unlimited rows. SECURITY DEFINER functions keep working
--    because they run as the function owner.
-- 2) log_security_event ignores the client-chosen bucket key (it is still
--    recorded in metadata) so its 30/hour cap really is per user, and caps the
--    metadata size.
-- 3) Messages: content capped at 4000 characters (app caps at 2000) and each
--    sender limited to 60 messages a minute and 3000 a day, enforced in the
--    database so a script calling the API directly is also stopped.
-- 4) friendships: remove the direct INSERT policy. accept_friend_request()
--    (SECURITY DEFINER) creates both rows; the app never inserts directly, and
--    the policy let a user add "friendship" rows with anyone without consent.
-- 5) Avatars bucket: 10 MB max file, JPEG only (the app always re-encodes to JPEG).

-- 1) -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;

-- 2) -------------------------------------------------------------------------
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
  v_uid uuid;
  v_event text;
  v_key text;
  v_meta jsonb;
BEGIN
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'log_security_event: event_type required';
  END IF;

  v_uid := auth.uid();
  v_event := left(trim(p_event_type), 64);
  -- Key is always derived server-side; the caller cannot pick another bucket.
  v_key := 'security_event:' || coalesce(v_uid::text, 'anon');

  PERFORM public.enforce_rate_limit(v_key, 30, 3600);

  v_meta := coalesce(p_metadata, '{}'::jsonb);
  IF jsonb_typeof(v_meta) <> 'object' OR pg_column_size(v_meta) > 2048 THEN
    v_meta := jsonb_build_object('metadata_dropped', true);
  END IF;
  IF p_bucket_key IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('client_key', left(p_bucket_key, 200));
  END IF;

  INSERT INTO public.security_audit_log (event_type, actor_id, bucket_key, metadata)
  VALUES (v_event, v_uid, v_key, v_meta);
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_event(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, jsonb) TO authenticated;

-- 3) -------------------------------------------------------------------------
-- NOT VALID: applies to new rows only, so existing messages are never touched.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_max_length;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_max_length
  CHECK (char_length(content) <= 4000) NOT VALID;

CREATE OR REPLACE FUNCTION public.messages_enforce_send_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / SQL editor inserts (no signed-in user) are not limited.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.enforce_rate_limit('send_message_min:' || auth.uid()::text, 60, 60);
  PERFORM public.enforce_rate_limit('send_message_day:' || auth.uid()::text, 3000, 86400);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.messages_enforce_send_rate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_messages_enforce_send_rate ON public.messages;
CREATE TRIGGER trg_messages_enforce_send_rate
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.messages_enforce_send_rate();

-- 4) -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert friendships as user" ON public.friendships;

-- 5) -------------------------------------------------------------------------
-- Skipped automatically when the storage schema is absent (local tests).
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
       SET file_size_limit = 10 * 1024 * 1024,
           allowed_mime_types = ARRAY['image/jpeg']
     WHERE id = 'Avatars';
  END IF;
END;
$$;
