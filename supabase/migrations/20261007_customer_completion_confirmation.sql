alter table public.bookings
  add column if not exists customer_confirmed_at timestamptz;

drop policy if exists "users delete own notifications" on public.notifications;
create policy "users delete own notifications"
on public.notifications
for delete to authenticated
using (user_id = auth.uid());

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
