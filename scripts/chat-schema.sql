-- RimRun Chat Schema
-- Run this in Supabase SQL Editor before using the chat feature

-- 0. Court subscriptions (user subscribes to court to access its chat)
create table if not exists public.court_subscriptions (
  user_id uuid references auth.users(id) on delete cascade,
  court_id uuid references public.courts(id) on delete cascade,
  subscribed_at timestamptz default now(),
  primary key (user_id, court_id)
);

create index if not exists idx_court_subscriptions_user on public.court_subscriptions(user_id);

alter table public.court_subscriptions enable row level security;

drop policy if exists "Users can manage own subscriptions" on public.court_subscriptions;
create policy "Users can manage own subscriptions"
  on public.court_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 1. Conversation type enum (idempotent: skip if already exists)
do $$ begin
  create type conversation_type as enum ('court', 'dm', 'group');
exception
  when duplicate_object then null;
end $$;

-- 2. Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type conversation_type not null,
  court_id uuid references public.courts(id) on delete cascade,
  name text,
  created_at timestamptz default now(),
  constraint court_conversation_has_court check (
    (type = 'court' and court_id is not null) or
    (type != 'court' and court_id is null)
  )
);

create index if not exists idx_conversations_court on public.conversations(court_id) where court_id is not null;
create unique index if not exists idx_conversations_court_unique on public.conversations(court_id) where type = 'court';

-- 3. Conversation participants
create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_participants_user on public.conversation_participants(user_id);

-- 4. Messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at desc);

-- 5. Enable Realtime
alter publication supabase_realtime add table public.messages;

-- 6. RLS
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

-- Helper to check participation without RLS recursion (SECURITY DEFINER bypasses RLS)
create or replace function public.user_is_conversation_participant(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

drop policy if exists "Users can read conversations they participate in" on public.conversations;
create policy "Users can read conversations they participate in"
  on public.conversations for select to authenticated
  using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = conversations.id and cp.user_id = auth.uid()
    )
    or (type = 'court' and exists (
      select 1 from court_subscriptions cs
      where cs.court_id = conversations.court_id and cs.user_id = auth.uid()
    ))
  );

drop policy if exists "Participants can read participants" on public.conversation_participants;
create policy "Participants can read participants"
  on public.conversation_participants for select to authenticated
  using (public.user_is_conversation_participant(conversation_id));

drop policy if exists "Users can add themselves to conversations" on public.conversation_participants;
create policy "Users can add themselves to conversations"
  on public.conversation_participants for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Read messages if in conversation" on public.messages;
create policy "Read messages if in conversation"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from conversation_participants cp
      where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
    )
    or exists (
      select 1 from conversations c
      join court_subscriptions cs on cs.court_id = c.court_id and cs.user_id = auth.uid()
      where c.id = messages.conversation_id and c.type = 'court'
    )
  );

drop policy if exists "Send message if in conversation" on public.messages;
create policy "Send message if in conversation"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      exists (
        select 1 from conversation_participants cp
        where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
      )
      or exists (
        select 1 from conversations c
        join court_subscriptions cs on cs.court_id = c.court_id and cs.user_id = auth.uid()
        where c.id = messages.conversation_id and c.type = 'court'
      )
    )
  );

-- 7. RPC: Get or create court conversation
create or replace function public.get_or_create_court_conversation(p_court_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
begin
  select id into v_conv_id from conversations where court_id = p_court_id and type = 'court' limit 1;
  if v_conv_id is null then
    insert into conversations (type, court_id) values ('court', p_court_id)
    returning id into v_conv_id;
  end if;
  return v_conv_id;
end;
$$;
