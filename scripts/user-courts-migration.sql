-- RimRun: user-submitted courts from the app (run after public.courts exists).

-- Link each user-added court row to the account that created it (nullable for OSM imports).
alter table public.courts
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Tag where a court came from (e.g. osm vs user) for RLS and analytics.
alter table public.courts
  add column if not exists source text;

-- Optional quality/score field used by imports and the add-court flow.
alter table public.courts
  add column if not exists confidence double precision;

-- Treat legacy NULL source as OSM so policies and queries can rely on a value.
update public.courts
set source = coalesce(source, 'osm')
where source is null;

-- Enforce policies below for SELECT/INSERT (service role still bypasses RLS).
alter table public.courts enable row level security;

-- Replace policy on re-run so you can edit the definition safely.
drop policy if exists "Courts readable by authenticated users" on public.courts;
-- Logged-in users can read all courts (map and detail screens).
create policy "Courts readable by authenticated users"
  on public.courts for select
  to authenticated
  using (true);

drop policy if exists "Users insert user-sourced courts" on public.courts;
-- Users may only insert rows they mark as user-created and attribute to themselves.
create policy "Users insert user-sourced courts"
  on public.courts for insert
  to authenticated
  with check (
    source = 'user'
    and created_by = auth.uid()
    and auth.uid() is not null
  );

-- Creators may remove courts they added (OSM rows have created_by null — not deletable via app).
drop policy if exists "Users delete courts they created" on public.courts;
create policy "Users delete courts they created"
  on public.courts for delete
  to authenticated
  using (created_by = auth.uid() and auth.uid() is not null);
