-- Security helpers: text sanitization + audit log for server-side events.
-- Run in Supabase SQL Editor after rate_limiting migration.

CREATE OR REPLACE FUNCTION public.sanitize_text(p_input text, p_max_length integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
BEGIN
  IF p_input IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_max_length IS NULL OR p_max_length < 1 THEN
    RAISE EXCEPTION 'sanitize_text: invalid max length';
  END IF;

  v_clean := regexp_replace(p_input, '[[:cntrl:]]', '', 'g');
  v_clean := trim(both from v_clean);
  RETURN left(v_clean, p_max_length);
END;
$$;

COMMENT ON FUNCTION public.sanitize_text IS
  'Strip control characters and truncate user text before persistence.';

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_created
  ON public.security_audit_log (event_type, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_audit_log_no_client"
  ON public.security_audit_log
  FOR ALL
  USING (false)
  WITH CHECK (false);

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
  v_key text;
BEGIN
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'log_security_event: event_type required';
  END IF;

  v_uid := auth.uid();
  v_key := coalesce(nullif(trim(p_bucket_key), ''), p_event_type || ':' || coalesce(v_uid::text, 'anon'));

  PERFORM public.enforce_rate_limit(v_key, 30, 3600);

  INSERT INTO public.security_audit_log (event_type, actor_id, bucket_key, metadata)
  VALUES (
    left(trim(p_event_type), 64),
    v_uid,
    left(v_key, 256),
    coalesce(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_security_event(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.log_security_event IS
  'Rate-limited security audit log for auth failures and suspicious activity. No direct table access.';
