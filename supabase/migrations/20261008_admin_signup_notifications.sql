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