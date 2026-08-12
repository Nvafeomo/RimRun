-- Lightweight heartbeat RPC so scheduled pings count as database activity
-- and free-tier projects are less likely to auto-pause from inactivity.

CREATE OR REPLACE FUNCTION public.keep_alive()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 1;
$$;

COMMENT ON FUNCTION public.keep_alive() IS
  'No-op query used by CI keep-alive pings to register database activity.';

REVOKE ALL ON FUNCTION public.keep_alive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.keep_alive() TO anon, authenticated, service_role;
