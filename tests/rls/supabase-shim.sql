-- ============================================================================
-- The parts of Supabase the migration leans on, for a plain Postgres.
--
-- Supabase gives every project an `auth` schema, an `auth.uid()` that reads
-- the signed-in user from the request's JWT, and two roles every request
-- runs as: `anon` (no session) and `authenticated` (a session). It also
-- grants both roles every privilege on tables in `public`, which is the
-- point: privileges let everything through, and row level security is the
-- only thing deciding what a role sees. A test database with tighter grants
-- than that would pass for the wrong reason.
--
-- On a real Supabase database all of this already exists and is left alone.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

create schema if not exists auth;

do $$
begin
  if to_regclass('auth.users') is null then
    create table auth.users (
      id uuid primary key,
      email text
    );
    -- the same reading of the request's claims Supabase's own auth.uid() does
    create function auth.uid() returns uuid
    language sql stable as $f$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $f$;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
