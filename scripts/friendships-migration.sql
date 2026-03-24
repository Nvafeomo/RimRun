-- RimRun: Friendships table (for Friends count; friend requests to be added later)
-- Run in Supabase SQL Editor

create table if not exists public.friendships (
  user_id uuid references auth.users(id) on delete cascade,
  friend_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, friend_id),
  constraint no_self_friend check (user_id != friend_id)
);

create index if not exists idx_friendships_user on public.friendships(user_id);
create index if not exists idx_friendships_friend on public.friendships(friend_id);

alter table public.friendships enable row level security;

-- Users can see friendships where they are user or friend; can only insert rows where they are user_id
drop policy if exists "Users can read own friendships" on public.friendships;
create policy "Users can read own friendships"
  on public.friendships for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists "Users can insert friendships as user" on public.friendships;
create policy "Users can insert friendships as user"
  on public.friendships for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own friendships" on public.friendships;
create policy "Users can delete own friendships"
  on public.friendships for delete to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
