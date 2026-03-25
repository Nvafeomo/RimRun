-- RimRun: court_subscriptions + stricter RLS for court chat (run after main chat schema exists).

-- Join table: user follows a court (required to read/send that court's chat).
create table if not exists public.court_subscriptions (
  user_id uuid references auth.users(id) on delete cascade,
  court_id uuid references public.courts(id) on delete cascade,
  subscribed_at timestamptz default now(),
  primary key (user_id, court_id)
);

-- List subscriptions by user for the Chats tab and policies.
create index if not exists idx_court_subscriptions_user on public.court_subscriptions(user_id);

alter table public.court_subscriptions enable row level security;

drop policy if exists "Users can manage own subscriptions" on public.court_subscriptions;
-- Users insert/update/delete only their own subscription rows.
create policy "Users can manage own subscriptions"
  on public.court_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can read conversations they participate in" on public.conversations;
-- DMs/groups via participants; court chats visible only if subscribed to that court.
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

drop policy if exists "Read messages if in conversation" on public.messages;
-- Read messages in DMs you're in, or in court threads where you're subscribed to the court.
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
-- Send only as yourself and only if the same participation/subscription rules pass.
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
