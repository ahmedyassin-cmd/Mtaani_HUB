-- Ensure the live Supabase schema includes the region/city fields required by the request and provider flows.

alter table public.service_requests
  add column if not exists region text,
  add column if not exists city text;

alter table public.provider_profiles
  add column if not exists region text,
  add column if not exists city text;

-- Keep both tables aligned with the app's location-aware onboarding flow.
create index if not exists idx_service_requests_region_city
  on public.service_requests (region, city);

create index if not exists idx_provider_profiles_region_city
  on public.provider_profiles (region, city);
