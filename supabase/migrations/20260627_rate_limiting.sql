-- Rate limiting for RPCs and authenticated actions.
-- Run in Supabase SQL Editor, then reload API schema.

CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_created
  ON public.rate_limit_events (bucket_key, created_at DESC);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- No direct client access; only SECURITY DEFINER functions write/read.
CREATE POLICY "rate_limit_events_no_client"
  ON public.rate_limit_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.enforce_rate_limit(
  p_bucket_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0 THEN
    RAISE EXCEPTION 'rate_limit: invalid bucket';
  END IF;

  IF p_max_attempts < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate_limit: invalid limit configuration';
  END IF;

  DELETE FROM public.rate_limit_events
  WHERE bucket_key = p_bucket_key
    AND created_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*)::integer INTO v_count
  FROM public.rate_limit_events
  WHERE bucket_key = p_bucket_key;

  IF v_count >= p_max_attempts THEN
    RAISE EXCEPTION 'rate_limit: Too many attempts. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_events (bucket_key) VALUES (p_bucket_key);
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_rate_limit(text, integer, integer) TO authenticated;

-- Helper for authenticated user-scoped actions (friend requests, blocks, etc.)
CREATE OR REPLACE FUNCTION public.enforce_user_rate_limit(
  p_action text,
  p_max_attempts integer,
  p_window_seconds integer
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
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_key := p_action || ':' || v_uid::text;
  PERFORM public.enforce_rate_limit(v_key, p_max_attempts, p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_user_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_user_rate_limit(text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.enforce_rate_limit IS
  'Sliding-window rate limit by bucket key. Raises rate_limit exception when exceeded.';

COMMENT ON FUNCTION public.enforce_user_rate_limit IS
  'Rate limit scoped to auth.uid() + action name. Call at start of sensitive RPCs.';

-- Example: wrap send_friend_request (adjust if your function signature differs)
-- CREATE OR REPLACE FUNCTION public.send_friend_request(p_receiver_id uuid) ...
