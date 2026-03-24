-- RimRun: Court Subscriptions Migration
-- Run this ONLY if you already have the main chat schema (conversations, messages, etc.)
-- Adds court_subscriptions and updates RLS to require subscription for court chat access

-- 1. Court subscriptions table
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

-- 2. Update conversations policy (require subscription for court chats)
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

-- 3. Update messages policies (require subscription for court chat read/send)
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
