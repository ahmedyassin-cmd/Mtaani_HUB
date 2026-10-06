# MtaaniHub

MtaaniHub is a local-services marketplace for customers and verified providers in Tanzania. The current MVP includes discovery, category filtering, provider profiles, saved providers, service requests, and role views for customer, provider, and admin.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Available role views

Use the avatar menu in the top-right corner to switch between:

- Customer: search providers, save providers, create requests, and view request activity.
- Provider: view sample incoming requests and submit quotations.
- Admin: view platform health metrics.

Demo request and saved-provider state is stored in browser `localStorage` so it survives refreshes.

## Supabase foundation

`supabase/schema.sql` contains the PostgreSQL schema and Row Level Security policies for profiles, categories, providers, services, requests, quotations, bookings, reviews, notifications, and admin logs. Run it in a Supabase SQL Editor, then replace the demo state with Supabase Auth and queries in the React app.

The UI intentionally works without credentials, so the project can be reviewed before a Supabase project is connected.

## Dashboards

The customer dashboard lists the signed-in customer's service requests and received quotations; customers can accept a quotation, track its progress, and confirm when completed work meets their expectations. Verified providers can view open requests, submit one quotation per request with an optional estimated duration, see when a customer accepts, start the work, and mark it complete. Customer-confirmed completions are counted for the provider and notify them. Notifications pop up when new, can be marked read, and can be deleted individually or all at once.

For a new database, run `supabase/schema.sql`, then run the migrations in order: `supabase/migrations/20261001_dashboards.sql`, `supabase/migrations/20261002_atomic_booking.sql`, `supabase/migrations/20261003_admin_provider_review.sql`, `supabase/migrations/20261004_targeted_provider_requests.sql`, `supabase/migrations/20261005_quotation_estimates.sql`, `supabase/migrations/20261006_booking_progress_notifications.sql`, and `supabase/migrations/20261007_customer_completion_confirmation.sql`. For an existing database, run any migrations not yet applied in that order in the Supabase SQL Editor. The targeted-request migration adds optional provider assignment to customer requests; the quotation-estimates migration adds the optional quotation estimate field; the booking-progress migration adds the provider-authorized progress update and customer completion notification; the customer-confirmation migration lets customers confirm completed work, notifies the provider, and enables deleting their own notifications.

Customer and provider dashboards retain broadcast requests if the targeted-provider column is not installed yet. Run `20261004_targeted_provider_requests.sql` to enable selecting a specific verified provider; without it, requests are sent to all verified providers as before. The app also falls back to requests and quotations without optional location/estimate columns on older databases.

An email address alone does not grant admin access. To bootstrap the first administrator, create the account first in Supabase Authentication → Users (or sign up and confirm its email). Run the migrations, then run this in the SQL Editor, replacing `admin@example.com` with the exact email used to sign in:

```sql
insert into public.profiles (id, full_name, role)
select id, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email), 'admin'
from auth.users
where lower(btrim(email)) = lower(btrim('admin@example.com'))
on conflict (id) do update set role = 'admin', updated_at = now()
returning id, full_name, role;
```

After that, admins approve provider applications from the Admin dashboard. Approval assigns the provider role and makes verified open-request and quotation actions available to that account.

After changing the account role, sign out and sign back in (or reload the app) so its profile is refreshed. If the admin dashboard reports a database/migration error, verify that all three migrations ran successfully in the same Supabase project configured in `.env.local`.
