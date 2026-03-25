-- RimRun: friend requests + DM RPC (run after friendships-migration.sql).

-- Pending/accepted/declined requests; one row per (sender, receiver) pair.
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete cascade not null,
  receiver_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique (sender_id, receiver_id)
);

-- List requests you sent.
create index if not exists idx_friend_requests_sender on public.friend_requests(sender_id);
-- List requests you received.
create index if not exists idx_friend_requests_receiver on public.friend_requests(receiver_id);

alter table public.friend_requests enable row level security;

drop policy if exists "Users can manage friend requests" on public.friend_requests;
-- Involved parties can see a request.
create policy "Users can read own friend requests"
  on public.friend_requests for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

-- Only the sender can create a request.
create policy "Users can insert friend requests as sender"
  on public.friend_requests for insert to authenticated
  with check (sender_id = auth.uid());

-- Receiver can accept or decline (status update).
create policy "Users can update requests they received"
  on public.friend_requests for update to authenticated
  using (receiver_id = auth.uid());

-- Sender can cancel a pending request.
create policy "Users can delete own sent requests"
  on public.friend_requests for delete to authenticated
  using (sender_id = auth.uid());

-- Find or create a 1:1 DM conversation and return its id (runs as definer to bypass participant RLS).
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
  -- Reject anonymous, missing target, or self-DM.
  if v_my_id is null or p_other_user_id is null or v_my_id = p_other_user_id then
    return null;
  end if;

  -- Stable ordering so both users map to the same pair key.
  v_user_a := least(v_my_id, p_other_user_id);
  v_user_b := greatest(v_my_id, p_other_user_id);

  -- Reuse existing DM if both users already share a dm-type conversation.
  select c.id into v_conv_id
  from conversations c
  join conversation_participants cp1 on cp1.conversation_id = c.id and cp1.user_id = v_user_a
  join conversation_participants cp2 on cp2.conversation_id = c.id and cp2.user_id = v_user_b
  where c.type = 'dm'
  limit 1;

  -- Otherwise create conversation + both participant rows.
  if v_conv_id is null then
    insert into conversations (type) values ('dm') returning id into v_conv_id;
    insert into conversation_participants (conversation_id, user_id) values (v_conv_id, v_user_a);
    insert into conversation_participants (conversation_id, user_id) values (v_conv_id, v_user_b);
  end if;

  return v_conv_id;
end;
$$;

-- Accept flow: mark request accepted and insert both friendship directions (definer bypasses insert RLS for the other user).
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
  -- Only the receiver can accept a pending request they own.
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
