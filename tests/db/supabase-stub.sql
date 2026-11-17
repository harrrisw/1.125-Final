-- Minimal stand-in for what a Supabase project provides before migrations run:
-- the auth schema, auth.uid(), the three API roles and their default grants.
-- Used only by tests/db/schema.test.ts, which runs the real migration on top.

create schema if not exists extensions;
create schema if not exists auth;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Supabase reads the signed-in user's id from the request's JWT claims.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;

-- Supabase grants table access to the API roles and relies on RLS as the guard.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
