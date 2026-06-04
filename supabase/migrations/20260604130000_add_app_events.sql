create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references public.profiles(id) on delete set null,
  family_id uuid references public.families(id) on delete set null,
  session_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_events_event_name_created_at_idx
on public.app_events (event_name, created_at desc);

create index if not exists app_events_family_created_at_idx
on public.app_events (family_id, created_at desc);

create index if not exists app_events_user_created_at_idx
on public.app_events (user_id, created_at desc);

alter table public.app_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_events'
      and policyname = 'anyone can record app events'
  ) then
    create policy "anyone can record app events"
    on public.app_events for insert
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_events'
      and policyname = 'users can read own app events'
  ) then
    create policy "users can read own app events"
    on public.app_events for select
    using (
      user_id = auth.uid()
      or (family_id is not null and public.is_family_member(family_id))
    );
  end if;
end $$;
