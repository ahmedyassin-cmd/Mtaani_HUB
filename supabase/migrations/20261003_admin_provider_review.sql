alter table public.provider_profiles
  add column if not exists service_category text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists experience_years integer not null default 0;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.service_requests enable row level security;

drop policy if exists "admins view all profiles" on public.profiles;
create policy "admins view all profiles" on public.profiles
for select to authenticated using (public.is_admin());

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins view all providers" on public.provider_profiles;
create policy "admins view all providers" on public.provider_profiles
for select to authenticated using (public.is_admin());

drop policy if exists "admins verify providers" on public.provider_profiles;
create policy "admins verify providers" on public.provider_profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins view all requests" on public.service_requests;
create policy "admins view all requests" on public.service_requests
for select to authenticated using (public.is_admin());
