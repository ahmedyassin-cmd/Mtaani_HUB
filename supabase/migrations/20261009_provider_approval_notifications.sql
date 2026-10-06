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