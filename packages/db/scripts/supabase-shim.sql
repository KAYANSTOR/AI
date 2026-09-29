-- Supabase-compatibility shim for local and CI migration runs.
--
-- This file is NOT a product migration and must never run against the real Supabase
-- project. It lives outside packages/db/migrations so the runner never picks it up.
--
-- Migrations reference objects that Supabase provisions for every project and that a
-- plain Postgres does not have:
--   * the `auth` schema, `auth.users` and `auth.uid()`
--   * the `anon`, `authenticated` and `service_role` PostgREST roles
--   * the default table privileges Supabase grants to those roles
--
-- Without them the migrations cannot be executed at all, so a database job that only
-- parsed the SQL would not prove anything. Applying this shim first lets CI actually
-- run migrations 0000..NNNN and assert the resulting invariants.
--
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/supabase-shim.sql

-- 1. auth schema, minimal auth.users and auth.uid() -------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mirrors Supabase's auth.uid(): the subject claim of the request JWT.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- 2. PostgREST roles --------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- 3. Privileges Supabase grants by default ---------------------------------------
-- Supabase grants these in the `public` schema; RLS is what actually restricts rows,
-- so granting table privileges here is not a security relaxation.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

DO $$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated, service_role',
      target.tablename
    );
  END LOOP;
END $$;
