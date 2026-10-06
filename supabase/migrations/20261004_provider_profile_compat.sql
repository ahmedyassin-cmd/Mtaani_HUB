alter table public.provider_profiles
  add column if not exists service_category text,
  add column if not exists region text,
  add column if not exists city text;

alter table public.service_requests
  add column if not exists region text,
  add column if not exists city text;

create index if not exists idx_provider_profiles_verified
  on public.provider_profiles (verified);

create index if not exists idx_provider_profiles_service_category
  on public.provider_profiles (service_category);
