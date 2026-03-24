-- RimRun: Friend requests and DM conversation RPC
-- Run in Supabase SQL Editor after friendships-migration.sql

-- 1. Friend requests table
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete cascade not null,
  receiver_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique (sender_id, receiver_id)
);

create index if not exists idx_friend_requests_sender on public.friend_requests(sender_id);
create index if not exists idx_friend_requests_receiver on public.friend_requests(receiver_id);

alter table public.friend_requests enable row level security;

drop policy if exists "Users can manage friend requests" on public.friend_requests;
create policy "Users can read own friend requests"
  on public.friend_requests for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "Users can insert friend requests as sender"
  on public.friend_requests for insert to authenticated
  with check (sender_id = auth.uid());

create policy "Users can update requests they received"
  on public.friend_requests for update to authenticated
  using (receiver_id = auth.uid());

create policy "Users can delete own sent requests"
  on public.friend_requests for delete to authenticated
  using (sender_id = auth.uid());

-- 2. RPC: Get or create DM conversation between current user and target user
create or replace function public.get_or_create_dm_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_id uuid := auth.uid();
  v_conv_id uuid;
  v_user_a uuid;
  v_user_b uuid;
begin
  if v_my_id is null or p_other_user_id is null or v_my_id = p_other_user_id then
    return null;
  end if;

  v_user_a := least(v_my_id, p_other_user_id);
  v_user_b := greatest(v_my_id, p_other_user_id);

  -- Look for existing DM (we need a way to identify DM pairs; conversations table has no direct DM support)
  -- DM conversations: type='dm', name can be null. We need to match by participants.
  select c.id into v_conv_id
  from conversations c
  join conversation_participants cp1 on cp1.conversation_id = c.id and cp1.user_id = v_user_a
  join conversation_participants cp2 on cp2.conversation_id = c.id and cp2.user_id = v_user_b
  where c.type = 'dm'
  limit 1;

  if v_conv_id is null then
    insert into conversations (type) values ('dm') returning id into v_conv_id;
    insert into conversation_participants (conversation_id, user_id) values (v_conv_id, v_user_a);
    insert into conversation_participants (conversation_id, user_id) values (v_conv_id, v_user_b);
  end if;

  return v_conv_id;
end;
$$;

-- 3. RPC: Accept friend request (creates both friendship rows; client can't insert for other user)
create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receiver_id uuid := auth.uid();
  v_sender_id uuid;
begin
  select sender_id into v_sender_id
  from friend_requests
  where id = p_request_id and receiver_id = v_receiver_id and status = 'pending';

  if v_sender_id is null then
    return;
  end if;

  update friend_requests set status = 'accepted' where id = p_request_id;

  insert into friendships (user_id, friend_id) values (v_receiver_id, v_sender_id);
  insert into friendships (user_id, friend_id) values (v_sender_id, v_receiver_id);
end;
$$;
