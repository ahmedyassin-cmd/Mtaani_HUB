alter table public.provider_profiles
  add column if not exists service_category text,
  add column if not exists region text,
  add column if not exists city text;

alter table public.service_requests
  add column if not exists region text,
  add column if not exists city text;

insert into public.service_categories (name, icon)
values
  ('Umeme', '⚡'),
  ('Plumbing', '◌'),
  ('ICT & Wi-Fi', '⌁'),
  ('Usafi', '✦'),
  ('Useremala', '⌂'),
  ('CCTV', '◉')
on conflict (name) do nothing;
