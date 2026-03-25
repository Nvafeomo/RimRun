-- Allow users to update their own profiles row (username, email, etc.) from the app.
-- Run in Supabase SQL Editor if Account / profile edits fail with RLS or "no row updated".

alter table public.profiles enable row level security;

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
