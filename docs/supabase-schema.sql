create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  wechat_openid text,
  wechat_unionid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  email text,
  role text not null default 'member',
  status text not null default 'invited',
  created_at timestamptz not null default now()
);

create table if not exists public.member_preferences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid references public.family_members(id) on delete cascade,
  likes text[] not null default '{}',
  dislikes text[] not null default '{}',
  allergies text[] not null default '{}',
  goals text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id text primary key,
  family_id uuid references public.families(id) on delete cascade,
  name text not null,
  payload jsonb not null,
  visibility text not null default 'global',
  created_at timestamptz not null default now()
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  plan_date date not null,
  meal_slot text not null default 'dinner',
  recipe_id text not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  amount text,
  expires_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  amount text,
  source text,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.member_preferences enable row level security;
alter table public.recipes enable row level security;
alter table public.meal_plans enable row level security;
alter table public.pantry_items enable row level security;
alter table public.shopping_items enable row level security;

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = target_family_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create policy "profiles are self readable"
on public.profiles for select
using (id = auth.uid());

create policy "profiles are self writable"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles are self updatable"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "families are visible to members"
on public.families for select
using (owner_id = auth.uid() or public.is_family_member(id));

create policy "users can create owned families"
on public.families for insert
with check (owner_id = auth.uid());

create policy "owners can update families"
on public.families for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "family members can read membership"
on public.family_members for select
using (user_id = auth.uid() or public.is_family_member(family_id));

create policy "owners can manage membership"
on public.family_members for all
using (
  exists (
    select 1 from public.families
    where families.id = family_members.family_id
      and families.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.families
    where families.id = family_members.family_id
      and families.owner_id = auth.uid()
  )
);

create policy "members can manage preferences"
on public.member_preferences for all
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

create policy "global recipes are readable"
on public.recipes for select
using (visibility = 'global' or public.is_family_member(family_id));

create policy "members can manage family recipes"
on public.recipes for all
using (family_id is not null and public.is_family_member(family_id))
with check (family_id is not null and public.is_family_member(family_id));

create policy "members can manage meal plans"
on public.meal_plans for all
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

create policy "members can manage pantry"
on public.pantry_items for all
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));

create policy "members can manage shopping items"
on public.shopping_items for all
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));
