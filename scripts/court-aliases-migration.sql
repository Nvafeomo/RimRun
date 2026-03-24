-- RimRun: User court aliases (custom names for courts)
-- Run in Supabase SQL Editor

create table if not exists public.user_court_aliases (
  user_id uuid references auth.users(id) on delete cascade,
  court_id uuid references public.courts(id) on delete cascade,
  custom_name text not null,
  updated_at timestamptz default now(),
  primary key (user_id, court_id)
);

create index if not exists idx_user_court_aliases_user on public.user_court_aliases(user_id);

alter table public.user_court_aliases enable row level security;

drop policy if exists "Users manage own aliases" on public.user_court_aliases;
create policy "Users manage own aliases"
  on public.user_court_aliases for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
