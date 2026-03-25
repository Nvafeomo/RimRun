-- RimRun: per-user display names for courts (map, chat title, lists).

-- Store custom label per (user, court); cascade delete when user or court is removed.
create table if not exists public.user_court_aliases (
  user_id uuid references auth.users(id) on delete cascade,
  court_id uuid references public.courts(id) on delete cascade,
  custom_name text not null,
  updated_at timestamptz default now(),
  primary key (user_id, court_id)
);

-- Speed up loading all aliases for the signed-in user.
create index if not exists idx_user_court_aliases_user on public.user_court_aliases(user_id);

-- All access goes through policies below.
alter table public.user_court_aliases enable row level security;

drop policy if exists "Users manage own aliases" on public.user_court_aliases;
-- Users may only read/write/delete their own alias rows.
create policy "Users manage own aliases"
  on public.user_court_aliases for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
