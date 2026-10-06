-- MtaaniHub database foundation
create extension if not exists "uuid-ossp";

create type public.user_role as enum ('customer', 'provider', 'admin');
create type public.request_status as enum ('open', 'quoted', 'booked', 'completed', 'cancelled');
create type public.booking_status as enum ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  role public.user_role not null default 'customer',
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  icon text,
  created_at timestamptz not null default now()
);

create table public.provider_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  business_name text,
  bio text,
  service_category text,
  region text,
  city text,
  experience_years integer not null default 0 check (experience_years >= 0),
  verified boolean not null default false,
  available boolean not null default true,
  service_area text,
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  category_id uuid not null references public.service_categories(id),
  title text not null,
  description text,
  starting_price numeric(12,2),
  created_at timestamptz not null default now()
);

create table public.service_requests (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid references public.provider_profiles(id) on delete set null,
  category_id uuid references public.service_categories(id),
  title text not null,
  description text,
  location text not null,
  region text,
  city text,
  preferred_date date,
  status public.request_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  message text,
  estimated_days integer,
  created_at timestamptz not null default now(),
  unique (request_id, provider_id)
);

create table public.bookings (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  scheduled_at timestamptz,
  status public.booking_status not null default 'pending',
  customer_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (booking_id, customer_id)
);

create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_logs (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    'customer'
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.notify_admins_of_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'customer' then
    insert into public.notifications (user_id, title, body)
    select id, 'Mteja mpya amejisajili', format('%s amefungua akaunti ya MtaaniHub.', new.full_name)
    from public.profiles
    where role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists notify_admins_after_customer_signup on public.profiles;
create trigger notify_admins_after_customer_signup
after insert on public.profiles
for each row execute procedure public.notify_admins_of_new_customer();

create or replace function public.notify_admins_of_provider_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  applicant_name text;
begin
  if not new.verified then
    select full_name into applicant_name
    from public.profiles
    where id = new.id;

    insert into public.notifications (user_id, title, body)
    select id, 'Provider mpya anaomba kujiunga', format('%s ameomba kujiunga kama provider wa %s.', coalesce(new.business_name, applicant_name, 'Provider'), coalesce(new.service_category, 'huduma'))
    from public.profiles
    where role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists notify_admins_after_provider_application on public.provider_profiles;
create trigger notify_admins_after_provider_application
after insert on public.provider_profiles
for each row execute procedure public.notify_admins_of_provider_application();

create or replace function public.notify_provider_of_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_name text;
begin
  if old.verified is false and new.verified is true then
    select full_name into provider_name
    from public.profiles
    where id = new.id;

    insert into public.notifications (user_id, title, body)
    values (
      new.id,
      'Umeidhinishwa kuwa provider',
      format('%s, admin amekuthibitisha. Sasa unaweza kupokea requests za huduma.', coalesce(provider_name, new.business_name, 'Provider'))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_provider_after_approval on public.provider_profiles;
create trigger notify_provider_after_approval
after update of verified on public.provider_profiles
for each row execute procedure public.notify_provider_of_approval();

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

alter table public.profiles enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.services enable row level security;
alter table public.service_requests enable row level security;
alter table public.quotations enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_logs enable row level security;

create policy "profiles are public to authenticated users" on public.profiles for select to authenticated using (true);
create policy "users create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "verified providers are public" on public.provider_profiles for select to anon, authenticated using (verified = true or id = auth.uid());
create policy "providers manage own profile" on public.provider_profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "services are public" on public.services for select to anon, authenticated using (true);
create policy "providers manage own services" on public.services for all to authenticated using (provider_id = auth.uid()) with check (provider_id = auth.uid());
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "customers see own requests" on public.service_requests;
drop policy if exists "customers create own requests" on public.service_requests;
drop policy if exists "providers see open requests" on public.service_requests;
drop policy if exists "request owners update status" on public.service_requests;
create policy "customers see own requests" on public.service_requests for select to authenticated using (customer_id = auth.uid());
create policy "customers create own requests" on public.service_requests for insert to authenticated with check (
  customer_id = auth.uid()
  and (
    provider_id is null
    or exists (
      select 1 from public.provider_profiles pp
      join public.profiles p on p.id = pp.id
      where pp.id = provider_id and pp.verified = true and p.role = 'provider'
    )
  )
);
create policy "verified providers see open requests" on public.service_requests for select to authenticated using (
  status = 'open'
  and (provider_id is null or provider_id = auth.uid())
  and exists (
    select 1 from public.profiles p
    join public.provider_profiles pp on pp.id = p.id
    where p.id = auth.uid() and p.role = 'provider' and pp.verified = true
  )
);
create policy "request owners update status" on public.service_requests for update to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());
drop policy if exists "admins view all requests" on public.service_requests;
create policy "admins view all requests" on public.service_requests for select to authenticated using (public.is_admin());
create policy "quotation participants can view" on public.quotations for select to authenticated using (provider_id = auth.uid() or exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = auth.uid()));
drop policy if exists "providers create own quotations" on public.quotations;
create policy "providers create own quotations" on public.quotations for insert to authenticated with check (
  provider_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    join public.provider_profiles pp on pp.id = p.id
    join public.service_requests r on r.id = request_id
    where p.id = auth.uid() and p.role = 'provider' and pp.verified = true
      and r.status = 'open' and (r.provider_id is null or r.provider_id = auth.uid())
  )
);
drop policy if exists "admins view all quotations" on public.quotations;
create policy "admins view all quotations" on public.quotations for select to authenticated using (public.is_admin());
create policy "booking participants can view" on public.bookings for select to authenticated using (exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = auth.uid()) or exists (select 1 from public.quotations q where q.id = quotation_id and q.provider_id = auth.uid()));
create policy "customers create bookings" on public.bookings for insert to authenticated with check (
  exists (select 1 from public.service_requests r where r.id = request_id and r.customer_id = auth.uid())
  and exists (select 1 from public.quotations q where q.id = quotation_id and q.request_id = request_id)
);
create or replace function public.accept_quotation(p_request_id uuid, p_quotation_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_booking_id uuid;
begin
  perform 1
  from public.service_requests
  where id = p_request_id
    and customer_id = auth.uid()
    and status = 'open'
  for update;

  if not found then
    raise exception 'Request is unavailable or does not belong to this customer';
  end if;

  if not exists (
    select 1 from public.quotations
    where id = p_quotation_id and request_id = p_request_id
  ) then
    raise exception 'Quotation does not belong to this request';
  end if;

  insert into public.bookings (request_id, quotation_id)
  values (p_request_id, p_quotation_id)
  returning id into created_booking_id;

  update public.service_requests
  set status = 'booked'
  where id = p_request_id;

  return created_booking_id;
end;
$$;
revoke all on function public.accept_quotation(uuid, uuid) from public;
grant execute on function public.accept_quotation(uuid, uuid) to authenticated;
create or replace function public.update_booking_progress(
  p_booking_id uuid,
  p_status public.booking_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record record;
  provider_name text;
begin
  if p_status is null or p_status not in ('in_progress', 'completed') then
    raise exception 'Unsupported booking status';
  end if;

  select b.id, b.request_id, b.status, r.customer_id, r.title, q.provider_id
  into booking_record
  from public.bookings b
  join public.quotations q on q.id = b.quotation_id
  join public.service_requests r on r.id = b.request_id
  join public.profiles p on p.id = auth.uid() and p.role = 'provider'
  join public.provider_profiles pp on pp.id = p.id and pp.verified = true
  where b.id = p_booking_id
    and q.provider_id = auth.uid()
  for update of b;

  if not found then
    raise exception 'Booking not found or provider is not authorized';
  end if;

  if p_status = 'in_progress' and booking_record.status not in ('pending', 'confirmed') then
    raise exception 'Only an accepted booking can be started';
  end if;
  if p_status = 'completed' and booking_record.status <> 'in_progress' then
    raise exception 'Only a started booking can be completed';
  end if;

  update public.bookings
  set status = p_status
  where id = p_booking_id;

  if p_status = 'completed' then
    update public.service_requests
    set status = 'completed'
    where id = booking_record.request_id;

    select coalesce(pp.business_name, p.full_name, 'Provider')
    into provider_name
    from public.provider_profiles pp
    join public.profiles p on p.id = pp.id
    where pp.id = auth.uid();

    insert into public.notifications (user_id, title, body)
    values (
      booking_record.customer_id,
      'Huduma imekamilika',
      format('%s amekamilisha kazi ya "%s". Fungua MtaaniHub kuona taarifa za request yako.', provider_name, booking_record.title)
    );
  end if;
end;
$$;
revoke all on function public.update_booking_progress(uuid, public.booking_status) from public;
grant execute on function public.update_booking_progress(uuid, public.booking_status) to authenticated;
create or replace function public.confirm_booking_completion(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_record record;
begin
  select b.id, b.status, b.customer_confirmed_at, q.provider_id, r.title
  into booking_record
  from public.bookings b
  join public.quotations q on q.id = b.quotation_id
  join public.service_requests r on r.id = b.request_id
  where b.id = p_booking_id
    and r.customer_id = auth.uid()
  for update of b;

  if not found then
    raise exception 'Booking not found or customer is not authorized';
  end if;
  if booking_record.status <> 'completed' then
    raise exception 'Provider has not marked this booking completed';
  end if;
  if booking_record.customer_confirmed_at is not null then
    raise exception 'Completion has already been confirmed';
  end if;

  update public.bookings
  set customer_confirmed_at = now()
  where id = p_booking_id;

  insert into public.notifications (user_id, title, body)
  values (
    booking_record.provider_id,
    'Mteja ameridhika na kazi',
    format('Mteja amethibitisha kuwa kazi ya "%s" imekamilika.', booking_record.title)
  );
end;
$$;
revoke all on function public.confirm_booking_completion(uuid) from public;
grant execute on function public.confirm_booking_completion(uuid) to authenticated;
create policy "review authors manage reviews" on public.reviews for all to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "users view own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "users delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy "admins view logs" on public.admin_logs for select to authenticated using (public.is_admin());
drop policy if exists "admins view all providers" on public.provider_profiles;
create policy "admins view all providers" on public.provider_profiles for select to authenticated using (public.is_admin());
drop policy if exists "admins verify providers" on public.provider_profiles;
create policy "admins verify providers" on public.provider_profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins view all profiles" on public.profiles;
create policy "admins view all profiles" on public.profiles for select to authenticated using (public.is_admin());
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.service_categories (name, icon) values
  ('Umeme', 'zap'), ('Plumbing', 'droplets'), ('ICT & Wi-Fi', 'wifi'),
  ('Usafi', 'sparkles'), ('Useremala', 'home'), ('CCTV', 'camera')
on conflict (name) do nothing;
