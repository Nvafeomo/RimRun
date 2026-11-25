-- Minimal stand-ins for the Supabase pieces the migrations depend on, so
-- policies and functions can be tested on a plain local Postgres.
-- Tables only have the columns the policies under test use.
-- Roles are cluster-wide, so create them only once.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id), role text DEFAULT 'user');
CREATE TABLE public.conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL, court_id uuid);
CREATE TABLE public.conversation_participants (conversation_id uuid, user_id uuid, PRIMARY KEY (conversation_id, user_id));
CREATE TABLE public.court_subscriptions (court_id uuid, user_id uuid);
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now());
CREATE TABLE public.friend_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid, receiver_id uuid, status text DEFAULT 'pending');
CREATE TABLE public.content_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid);
CREATE TABLE public.friendships (
  user_id uuid REFERENCES auth.users(id), friend_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(), PRIMARY KEY (user_id, friend_id),
  CONSTRAINT no_self_friend CHECK (user_id != friend_id));
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.is_user_banned(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.user_chat_is_suspended(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE POLICY "Read messages if in conversation" ON public.messages FOR SELECT TO authenticated USING (true);

-- Supabase grants table access to API roles; RLS does the filtering.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
-- Mirror Supabase defaults for objects the migrations create later.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

INSERT INTO auth.users (id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.conversations (id, type) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dm');
INSERT INTO public.conversation_participants VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
