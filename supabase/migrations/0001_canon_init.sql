-- ============================================================================
-- M1 · schema & RLS
--
-- NOT APPLIED. CLAUDE.md non-negotiable #2: never write or apply a migration
-- without showing the SQL first and waiting. This file is the SQL, for review.
--
-- Apply with `npx supabase db push` yourself — it is in the deny list for the
-- agent on purpose. An agent that can silently alter production schema is an
-- agent that will eventually drop a column.
--
-- Two things to check before approving:
--   1. every table below enables row level security
--   2. the character caps match src/lib/schema.ts (why 200, note 300)
-- ============================================================================

create extension if not exists citext;

-- ===== identity =====
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  handle citext unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 200),
  region text not null default 'us' check (region ~ '^[a-z]{2}$'),
  theme jsonb not null default '{}'::jsonb,
  -- a room is private until you open it; see audienceSchema
  default_audience text not null default 'invited'
    check (default_audience in ('private','invited','household','everyone')),
  created_at timestamptz not null default now()
);

-- ===== content: one canonical row per work, shared across everyone =====
create table works (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('youtube','film','tv','article','music','other')),
  title text not null check (char_length(title) between 1 and 200),
  canonical_url text not null unique,
  external_ids jsonb not null default '{}'::jsonb,  -- {tmdb_id, youtube_id, imdb_id}
  runtime text,
  created_at timestamptz not null default now()
);

-- ===== shelves: where the audience model lives =====
create table shelves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null,
  audience text not null default 'invited'
    check (audience in ('private','invited','household','everyone')),
  -- non-null makes this a capsule: sealed until the date, for named people
  opens_at timestamptz,
  capsule_message text check (char_length(capsule_message) <= 300),
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references shelves on delete cascade,
  work_id uuid not null references works on delete restrict,
  -- the third place the 200-char cap is enforced; the other two are the zod
  -- schema and the textarea maxLength
  why text not null check (char_length(why) between 1 and 200),
  weight smallint not null default 2 check (weight between 1 and 3),
  highlighted boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (shelf_id, work_id)
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries on delete cascade,
  author_id uuid not null references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

-- ===== who gets in =====
create table invites (
  shelf_id uuid not null references shelves on delete cascade,
  invitee_email citext not null,
  invitee_id uuid references profiles on delete cascade,
  invited_at timestamptz not null default now(),
  primary key (shelf_id, invitee_email)
);

-- a household is the shared-canon case: several people, one room
create table household_members (
  household_owner_id uuid not null references profiles on delete cascade,
  member_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_owner_id, member_id),
  check (household_owner_id <> member_id)
);

-- ===== availability cache =====
create table availability (
  work_id uuid not null references works on delete cascade,
  region text not null,
  payload jsonb not null,            -- normalised providers; justwatch via tmdb
  fetched_at timestamptz not null default now(),
  primary key (work_id, region)
);

-- ============================================================================
-- ROW LEVEL SECURITY — the security boundary
-- ============================================================================

alter table profiles            enable row level security;
alter table works               enable row level security;
alter table shelves             enable row level security;
alter table entries             enable row level security;
alter table notes               enable row level security;
alter table invites             enable row level security;
alter table household_members   enable row level security;
alter table availability        enable row level security;

-- The whole visibility model, in one predicate. Everything downstream
-- inherits it, so it only has to be right once.
create or replace function can_view_shelf(s shelves) returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- a capsule is shut until its date, for everybody, including the people
    -- it is addressed to. this clause comes first on purpose.
    (s.opens_at is null or s.opens_at <= now())
    and (
      s.owner_id = auth.uid()
      or s.audience = 'everyone'
      or (s.audience = 'invited' and exists (
            select 1 from invites i
            where i.shelf_id = s.id and i.invitee_id = auth.uid()))
      or (s.audience = 'household' and exists (
            select 1 from household_members h
            where h.household_owner_id = s.owner_id and h.member_id = auth.uid()))
      -- 'private' has no branch: owner only, which the first test above covers
    );
$$;

create policy shelves_read on shelves for select using (can_view_shelf(shelves));
create policy shelves_write on shelves for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy entries_read on entries for select using (
  exists (select 1 from shelves s where s.id = entries.shelf_id and can_view_shelf(s)));
create policy entries_write on entries for all using (
  exists (select 1 from shelves s where s.id = entries.shelf_id and s.owner_id = auth.uid()))
  with check (
  exists (select 1 from shelves s where s.id = entries.shelf_id and s.owner_id = auth.uid()));

create policy notes_read on notes for select using (
  exists (select 1 from entries e join shelves s on s.id = e.shelf_id
          where e.id = notes.entry_id and can_view_shelf(s)));
create policy notes_write on notes for all
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- profiles are readable: a handle has to resolve for anyone holding the link
create policy profiles_read on profiles for select using (true);
create policy profiles_write on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- works are a shared catalogue, readable by anyone, writable by signed-in users
create policy works_read on works for select using (true);
create policy works_insert on works for insert to authenticated with check (true);

create policy invites_owner on invites for all using (
  exists (select 1 from shelves s where s.id = invites.shelf_id and s.owner_id = auth.uid()))
  with check (
  exists (select 1 from shelves s where s.id = invites.shelf_id and s.owner_id = auth.uid()));
create policy invites_read_own on invites for select using (invitee_id = auth.uid());

create policy household_owner on household_members for all
  using (household_owner_id = auth.uid()) with check (household_owner_id = auth.uid());
create policy household_read_own on household_members for select using (member_id = auth.uid());

create policy availability_read on availability for select using (true);

-- ============================================================================
-- Before this is called done, tests/rls/ must prove the NEGATIVE cases:
--   · a stranger gets zero rows from a 'private' shelf
--   · a stranger gets zero rows from an 'invited' shelf
--   · an invitee gets zero rows from a capsule before opens_at
--   · a household member gets zero rows from another household's shelf
--   · an anonymous client gets zero entries from any non-'everyone' shelf
-- Write them first, watch them fail, then trust the policy.
-- ============================================================================
