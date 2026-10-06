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
