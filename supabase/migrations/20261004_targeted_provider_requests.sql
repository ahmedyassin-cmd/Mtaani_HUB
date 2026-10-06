alter table public.service_requests
  add column if not exists provider_id uuid references public.provider_profiles(id) on delete set null;

create index if not exists service_requests_provider_id_idx
  on public.service_requests (provider_id);

drop policy if exists "customers create own requests" on public.service_requests;
create policy "customers create own requests" on public.service_requests
for insert to authenticated with check (
  customer_id = auth.uid()
  and (
    provider_id is null
    or exists (
      select 1
      from public.provider_profiles pp
      join public.profiles p on p.id = pp.id
      where pp.id = provider_id
        and pp.verified = true
        and p.role = 'provider'
    )
  )
);

drop policy if exists "providers see open requests" on public.service_requests;
drop policy if exists "verified providers see open requests" on public.service_requests;
create policy "verified providers see open requests" on public.service_requests
for select to authenticated using (
  status = 'open'
  and (provider_id is null or provider_id = auth.uid())
  and exists (
    select 1
    from public.profiles p
    join public.provider_profiles pp on pp.id = p.id
    where p.id = auth.uid()
      and p.role = 'provider'
      and pp.verified = true
  )
);

drop policy if exists "providers create own quotations" on public.quotations;
create policy "providers create own quotations" on public.quotations
for insert to authenticated with check (
  provider_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    join public.provider_profiles pp on pp.id = p.id
    join public.service_requests r on r.id = request_id
    where p.id = auth.uid()
      and p.role = 'provider'
      and pp.verified = true
      and r.status = 'open'
      and (r.provider_id is null or r.provider_id = auth.uid())
  )
);
