-- RimRun security audit (READ-ONLY: changes nothing).
-- Paste into Supabase -> SQL Editor -> Run. Copy the single JSON cell it returns.
-- It reports the live rules that are not tracked in this repo, so security
-- changes can be checked against what the database actually enforces.

WITH
tables_without_rls AS (
  SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb) AS v
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
),
policies AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'table', tablename, 'policy', policyname, 'cmd', cmd,
           'permissive', permissive, 'roles', roles,
           'using', qual, 'check', with_check)
         ORDER BY tablename, policyname), '[]'::jsonb) AS v
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('profiles', 'messages', 'conversations', 'conversation_participants',
                      'friend_requests', 'friendships', 'user_blocks', 'court_subscriptions',
                      'content_reports')
),
functions AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'name', p.proname,
           'args', pg_get_function_identity_arguments(p.oid),
           'security_definer', p.prosecdef,
           'anon_can_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
           'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
           'definition', pg_get_functiondef(p.oid))
         ORDER BY p.proname), '[]'::jsonb) AS v
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN ('get_or_create_dm_conversation', 'accept_friend_request',
                      'send_friend_request', 'lookup_login_email', 'enforce_rate_limit',
                      'enforce_user_rate_limit', 'log_security_event',
                      'create_group_conversation', 'add_group_member',
                      'require_mutual_age_for_users', 'users_are_blocked',
                      'court_pair_message_visible', 'user_chat_is_suspended',
                      'search_profiles_for_discovery', 'get_public_profile_summary',
                      'submit_content_report')
),
profile_columns AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'column', column_name,
           'type', data_type,
           'authenticated_can_update',
             has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE'))
         ORDER BY ordinal_position), '[]'::jsonb) AS v
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
),
triggers AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'table', event_object_table, 'trigger', trigger_name,
           'timing', action_timing, 'event', event_manipulation,
           'action', action_statement)
         ORDER BY event_object_table, trigger_name), '[]'::jsonb) AS v
  FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table IN ('profiles', 'messages', 'friend_requests',
                               'conversation_participants', 'friendships')
),
buckets AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('bucket', name, 'public', public)
         ORDER BY name), '[]'::jsonb) AS v
  FROM storage.buckets
),
storage_policies AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'policy', policyname, 'cmd', cmd, 'roles', roles,
           'using', qual, 'check', with_check)
         ORDER BY policyname), '[]'::jsonb) AS v
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
)
SELECT jsonb_pretty(jsonb_build_object(
  'tables_without_rls', (SELECT v FROM tables_without_rls),
  'policies', (SELECT v FROM policies),
  'functions', (SELECT v FROM functions),
  'profile_columns', (SELECT v FROM profile_columns),
  'triggers', (SELECT v FROM triggers),
  'storage_buckets', (SELECT v FROM buckets),
  'storage_policies', (SELECT v FROM storage_policies)
)) AS security_audit;
