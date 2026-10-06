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
