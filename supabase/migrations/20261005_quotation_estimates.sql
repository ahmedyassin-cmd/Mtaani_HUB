alter table public.quotations
  add column if not exists estimated_days integer
  check (estimated_days is null or estimated_days > 0);
