-- RimRun: mutual friendship edges (two rows per pair after accept).

-- One row means "user_id lists friend_id as a friend"; no self-edges.
create table if not exists public.friendships (
  user_id uuid references auth.users(id) on delete cascade,
  friend_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, friend_id),
  constraint no_self_friend check (user_id != friend_id)
);

-- Fast lookup of friends by user_id.
create index if not exists idx_friendships_user on public.friendships(user_id);
-- Fast reverse lookup (who lists this user).
create index if not exists idx_friendships_friend on public.friendships(friend_id);

alter table public.friendships enable row level security;

drop policy if exists "Users can read own friendships" on public.friendships;
-- See rows where you are either side of the friendship.
create policy "Users can read own friendships"
  on public.friendships for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

drop policy if exists "Users can insert friendships as user" on public.friendships;
-- RLS only allows inserting rows where you are user_id (other side added via RPC on accept).
create policy "Users can insert friendships as user"
  on public.friendships for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own friendships" on public.friendships;
-- Either party can remove the edge (app should delete both directions).
create policy "Users can delete own friendships"
  on public.friendships for delete to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
