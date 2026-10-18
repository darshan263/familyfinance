-- Run this in the Supabase SQL editor AFTER `prisma db push` has created the tables.
-- Re-run it any time you add a model.
--
-- WHY THIS EXISTS
--
-- Supabase publishes everything in the `public` schema through PostgREST, its automatic REST
-- API, reachable with the project's `anon` key. That key is designed to be public. New tables
-- also pick up default privileges for the `anon` and `authenticated` roles.
--
-- FamilyFinance does not use PostgREST, Supabase Auth, or the anon key. It talks to Postgres
-- directly through Prisma. Without the statements below the project would publish the
-- password hash and every account, balance and entry through an API the app never uses.
--
-- Row level security with NO policies denies every role that is not the table owner. Prisma
-- connects as the owner, so the app is unaffected; PostgREST gets nothing.
--
-- Verify rather than trust: Table Editor should show RLS enabled on all nine tables, and a
-- request to the REST endpoint with the anon key should return no rows.

alter table public."User" enable row level security;
alter table public."Member" enable row level security;
alter table public."Account" enable row level security;
alter table public."Category" enable row level security;
alter table public."Transaction" enable row level security;
alter table public."Valuation" enable row level security;
alter table public."Activity" enable row level security;
alter table public."Setting" enable row level security;
alter table public."RateLimit" enable row level security;

-- Belt and braces: take the grants away too, so this does not depend on RLS alone.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- And stop future tables from picking the grants back up.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
