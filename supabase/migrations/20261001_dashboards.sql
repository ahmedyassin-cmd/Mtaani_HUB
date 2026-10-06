create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before update on public.profiles
for each row execute procedure public.prevent_role_escalation();

create or replace function public.prevent_provider_self_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.verified and not public.is_admin() then
    new.verified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_provider_verification on public.provider_profiles;
create trigger protect_provider_verification
before insert or update on public.provider_profiles
for each row execute procedure public.prevent_provider_self_verification();

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "admins view all profiles" on public.profiles;
create policy "admins view all profiles" on public.profiles
for select to authenticated using (public.is_admin());

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "customers see own requests" on public.service_requests;
drop policy if exists "providers see open requests" on public.service_requests;
drop policy if exists "verified providers see open requests" on public.service_requests;
drop policy if exists "admins view all requests" on public.service_requests;
create policy "customers see own requests" on public.service_requests
for select to authenticated using (customer_id = auth.uid());
create policy "verified providers see open requests" on public.service_requests
for select to authenticated using (
  status = 'open'
  and exists (
    select 1 from public.profiles p
    join public.provider_profiles pp on pp.id = p.id
    where p.id = auth.uid() and p.role = 'provider' and pp.verified = true
  )
);
create policy "admins view all requests" on public.service_requests
for select to authenticated using (public.is_admin());

drop policy if exists "providers create own quotations" on public.quotations;
create policy "providers create own quotations" on public.quotations
for insert to authenticated with check (
  provider_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    join public.provider_profiles pp on pp.id = p.id
    where p.id = auth.uid() and p.role = 'provider' and pp.verified = true
  )
);
drop policy if exists "admins view all quotations" on public.quotations;
create policy "admins view all quotations" on public.quotations
for select to authenticated using (public.is_admin());

drop policy if exists "customers create bookings" on public.bookings;
create policy "customers create bookings" on public.bookings
for insert to authenticated with check (
  exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = auth.uid())
  and exists (select 1 from public.quotations q where q.id = quotation_id and q.request_id = request_id)
);

drop policy if exists "admins view all providers" on public.provider_profiles;
create policy "admins view all providers" on public.provider_profiles
for select to authenticated using (public.is_admin());
drop policy if exists "admins verify providers" on public.provider_profiles;
create policy "admins verify providers" on public.provider_profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins view logs" on public.admin_logs;
create policy "admins view logs" on public.admin_logs
for select to authenticated using (public.is_admin());
