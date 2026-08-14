# CANON — Implementation Plan for Claude Code
### A solo-founder build spec, written to be executed by an agent
*v1 · August 2026 · companion to `canon-business-plan.md` and the `canon.html` prototype*

---

## 0. How to use this document

This is not a document to read once. It is the **operating manual for the build**. Copy it into the repo as `docs/PLAN.md` on day one. Claude Code reads it, works a milestone, and you review.

**The core loop, every session:**

1. Open a terminal in the repo. Run `claude`.
2. Say: `Read docs/PLAN.md and docs/PROGRESS.md. We're doing milestone M<n>. Enter plan mode first.`
3. Review the plan it proposes. Approve or correct it. **Never skip this.**
4. Let it build. It must stop at the milestone's Definition of Done — not further.
5. Run the verification commands yourself.
6. Have it update `docs/PROGRESS.md`, commit, and open a PR.
7. `/clear` before the next milestone. Fresh context per milestone is the single highest-leverage habit.

**Non-negotiable rules for the agent** (these go in `CLAUDE.md`, §4):

- One milestone per session. Never work ahead.
- Never write a database migration without showing the SQL first and waiting for approval.
- Never commit secrets. Never `--no-verify`. Never disable a failing test to make CI green.
- If blocked twice on the same thing, stop and ask rather than trying a third approach.

---

## 1. What we're building (spec, condensed)

A **personal curated content network**. One page per person listing the content that shaped them — each item a link, a one-line *why*, a weight, and **where it's actually streamable in that visitor's region**.

Four surfaces, in priority order:

| # | Surface | Why it exists |
|---|---|---|
| 1 | **The canon profile** (`canon.so/tumelo`) | The shareable identity object. This is the product. |
| 2 | **Availability layer** (JustWatch-style) | Turns a list into a thing you can act on tonight. Retention. |
| 3 | **The store** (BingeBuster-style walkable 3D) | The reason people screenshot and share it. Acquisition. |
| 4 | **Membership** (Patreon-style, SFW) | Revenue, and the reason curators bring audiences. |

Plus two content moats that cost little: **time capsules** (scheduled-release shelves) and the **regional archive** (public ratings data by country/year).

**Storage tiers** — one concept governs all privacy, and it maps 1:1 to database row-level security:

| Tier | Name | Who sees it |
|---|---|---|
| 0 | The lounge shelf | Public — anyone, logged out |
| 1 | The storage unit | Followers |
| 2 | The vault | Paying members of that curator |
| 3 | The castle | Named invitees only (capsules, private shelves) |

---

## 2. Stack

Chosen for *solo maintainability* first, and because Claude Code is strongest in this ecosystem.

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript, strict** | Server components mean the availability layer renders server-side and caches well. TS strict gives the agent a feedback loop it can't fake. |
| Hosting | **Vercel** | Zero-ops. Preview deploy per PR = you can look at the agent's work before merging. |
| DB + Auth | **Supabase** (Postgres, RLS, Auth) | RLS lets the tier model be enforced *in the database*, not in app code the agent might forget to check. This is the single most important architectural decision here. |
| DB access | **`supabase-js` + generated types** (`supabase gen types`) | Generated types mean schema drift becomes a compile error. Skip an ORM — RLS + generated types is enough, and one fewer abstraction for the agent to get wrong. |
| Styling | **Tailwind + CSS custom properties** | Design tokens from the prototype live as CSS vars so theming/generative UI works. Tailwind for layout only. |
| 3D store | **CSS 3D transforms** (as prototyped), not Three.js | Ships in the same bundle, works without WebGL, degrades to the list view. Revisit Three.js only if the store becomes the main surface. |
| Availability | **TMDB API** (`/watch/providers`) + Redis cache | See §6 for the two hard constraints. |
| Payments | **Stripe** (Checkout + Billing; **Connect Express** when curator payouts start) | Standard, well-documented, agent knows it well. |
| Cache/rate-limit | **Upstash Redis** | Serverless-friendly; availability responses cached 24h. |
| Email | **Resend** + React Email | Capsule-release and digest emails. |
| Analytics | **PostHog** | Needed from day one to measure the two gate metrics (§11). |
| Errors | **Sentry** | Solo founders can't watch logs. |
| Tests | **Vitest** (unit) + **Playwright** (e2e, incl. RLS) | |
| CI | **GitHub Actions** | typecheck → lint → unit → build → e2e. |

**Deliberately NOT in v1:** mobile apps, an ORM, microservices, a design system package, GraphQL, Kubernetes, a custom auth system, NFTs/chain, scraping of any streaming account.

---

## 3. Environment setup (do this yourself, before the agent touches anything)

```bash
# 1. scaffold
npx create-next-app@latest canon --typescript --tailwind --app --eslint --src-dir
cd canon && git init && gh repo create canon --private --source=. 

# 2. deps
npm i @supabase/supabase-js @supabase/ssr zod stripe @upstash/redis \
      posthog-js @sentry/nextjs resend date-fns
npm i -D vitest @vitejs/plugin-react @testing-library/react @playwright/test \
      supabase prettier prettier-plugin-tailwindcss

# 3. supabase
npx supabase init && npx supabase login && npx supabase link --project-ref <ref>

# 4. verify the toolchain works BEFORE the agent starts
npm run build && npx playwright install --with-deps
```

**Accounts to create first** (blocking, and the agent cannot do these for you): Supabase, Vercel, TMDB API key (free, instant), Stripe (test mode), Upstash, Resend, PostHog, Sentry.

`.env.local` — and add `.env*` to `.gitignore` before the first commit:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only. NEVER in a client component.
TMDB_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
```

---

## 4. `CLAUDE.md` — paste this into the repo root

```markdown
# CANON

A personal curated content network. Each person has a public "canon": content that
shaped them, with a one-line why and where to stream it in the visitor's region.

## Commands
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint`
- `npm test` (vitest) · `npm run test:e2e` (playwright)
- `npx supabase db diff -f <name>` — generate a migration from local schema changes
- `npx supabase gen types typescript --linked > src/lib/database.types.ts`

## Architecture
- Next.js 15 App Router. Server Components by default; `"use client"` only for
  interactivity (the store, drawers, forms).
- Supabase Postgres. **Row Level Security is the security boundary.** Application
  code must never be the only thing preventing access to a row.
- `src/lib/supabase/server.ts` — server client (cookie-based session)
- `src/lib/supabase/client.ts` — browser client
- The service-role key is used in exactly one place: `src/lib/supabase/admin.ts`,
  which must never be imported by a client component. If you need it elsewhere, stop and ask.

## Non-negotiables
1. **One milestone per session.** Milestones are in `docs/PLAN.md`. Do not work ahead.
2. **Never write or apply a migration without showing me the SQL first and waiting.**
3. Every new table gets RLS enabled in the same migration, plus a policy test in
   `tests/rls/`. A table without RLS is a bug, not a TODO.
4. Never commit secrets. Never `git commit --no-verify`. Never skip or delete a
   failing test to get green — fix it or tell me it's failing.
5. All user input validated with zod at the boundary. Notes are capped at 300
   characters in the DB (CHECK constraint), the API, and the UI — all three.
6. No new dependency without asking. Especially no UI kits, ORMs, or state libraries.
7. If you're blocked twice on the same problem, stop and explain — don't try a third approach.
8. Prefer editing an existing file over creating a new one. Don't create README/docs
   files unless I ask.

## Conventions
- Design tokens are CSS custom properties in `src/app/globals.css` (`--paper`,
  `--ink`, `--red`, `--phos`…). Tailwind for layout, CSS vars for colour/theme.
  Never hardcode a hex value in a component.
- Server actions for mutations; route handlers only for webhooks and public APIs.
- Errors: throw typed errors, catch at the boundary, log to Sentry, never swallow.
- Copy voice: lowercase, warm, plain. "the content that made you" not "curate your media journey".

## Testing
- Any change touching access control requires an RLS test proving an unauthorised
  role gets zero rows. Write the failing test first.
- E2E covers the four critical paths: create a canon, view someone else's canon,
  membership unlock, walk the store.
```

---

## 5. Claude Code configuration

### `.claude/settings.json`

Pre-approving safe commands removes most permission prompts; leaving destructive ones out means you still get asked.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)", "Bash(npx tsc *)", "Bash(npx vitest *)",
      "Bash(npx playwright test *)", "Bash(git status)", "Bash(git diff *)",
      "Bash(git log *)", "Bash(git add *)", "Bash(git commit *)",
      "Bash(npx supabase gen types *)", "Bash(npx supabase db diff *)"
    ],
    "deny": [
      "Bash(npx supabase db push *)", "Bash(npx supabase db reset *)",
      "Bash(git push --force*)", "Bash(rm -rf *)", "Read(./.env*)"
    ]
  }
}
```

`Read(./.env*)` in deny keeps your secrets out of the model's context entirely.

### Hooks — `.claude/settings.json` → `hooks`

A `PostToolUse` hook on `Edit|Write` that runs typecheck gives the agent an immediate, honest signal. This is worth more than any amount of prompting:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "npx tsc --noEmit 2>&1 | head -30" }]
    }]
  }
}
```

### Subagents — `.claude/agents/`

Two are worth having:

- **`security-reviewer.md`** — invoked after any milestone touching RLS, auth, payments, or webhooks. Prompt it to specifically hunt for: tables without RLS, service-role key reaching client code, missing webhook signature verification, IDOR via user-supplied IDs, and unvalidated input.
- **`ui-critic.md`** — invoked after UI milestones. Give it the design principles from §12 and have it screenshot via Playwright and critique against them. Counters the agent's default drift toward generic AI-looking UI.

### MCP servers worth connecting

- **Supabase MCP** — lets it inspect the live schema instead of guessing.
- **Playwright MCP** — lets it drive the browser, take screenshots, and *see* the store it built. Essential for the 3D work.
- **Sentry MCP** (post-launch) — "fix the top error from this week" becomes a real prompt.

### Workflow habits that matter most

- **Plan mode (`shift+tab`) before every milestone.** Cheapest possible way to catch a wrong approach.
- **`/clear` between milestones.** Long contexts degrade quality and cost money.
- **Screenshots in, always.** Paste an image of what's wrong rather than describing it.
- **Small PRs.** One milestone ≈ one PR ≈ something you can actually review.

---

## 6. External integrations — and their traps

### TMDB / JustWatch availability ⚠️ Two hard constraints

TMDB's `/watch/providers` endpoint is powered by JustWatch, and:

1. **It does not return deep links to Netflix/Prime/etc.** It returns a TMDB `/watch` page link. You cannot legitimately synthesise "open in Netflix" URLs from it. The honest UX is a "where to watch →" button that hands off to the TMDB watch page. If direct deep links are essential later, that requires a commercial **JustWatch partner agreement**.
2. **Attribution is mandatory and per-item.** TMDB requires the JustWatch source to be credited on *every* media item displaying provider data, not once in a footer, and revokes API access for non-compliance. Both TMDB and JustWatch must be attributed.

**Design consequence, decided now:** every availability chip carries a small "via JustWatch" credit, and the click target goes to the TMDB watch page. Build it this way from M4 — retrofitting attribution across a 3D store is miserable.

Cache provider responses in Redis for 24h keyed `avail:{tmdb_id}:{region}`. TMDB rate limits are generous but the cache is what keeps the store fast.

### YouTube

Use the official iframe embed only. Never proxy, download, or rehost. Embedded views count for the creator — say so in the UI; it's both true and good positioning. `youtube-nocookie.com` for the privacy win.

### Stripe

- **Phase 1 (M7):** plain Checkout + Billing subscriptions to *you*. No Connect.
- **Phase 2 (post-launch):** **Connect Express** for curator payouts, with the platform fee taken as an application fee. Do not build this until you have curators with real audiences — it adds onboarding, payouts, disputes, and tax-reporting surface.
- Webhooks: verify the signature, make handlers **idempotent** (Stripe retries), and store `stripe_event_id` with a unique constraint. Test with `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### Regional archive data

Only ingest sources whose licence permits reuse — national broadcaster year-end reports, official ratings bodies, Wikipedia (CC BY-SA, with attribution). Store a `source_url` and `licence` column per row. This is a small, boring discipline that prevents a takedown later.

---

## 7. Data model

Give the agent this schema; have it produce migrations one table group at a time.

```sql
-- ===== identity =====
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  handle citext unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null,
  bio text check (char_length(bio) <= 200),
  region text not null default 'us',        -- iso-3166-1 alpha-2, lowercase
  theme jsonb not null default '{}'::jsonb, -- {accent, font, texture, view}
  is_curator boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== content =====
-- one canonical row per piece of content, shared across all users
create table works (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('youtube','film','tv','article','music','other')),
  title text not null,
  canonical_url text not null unique,
  external_ids jsonb not null default '{}'::jsonb,  -- {tmdb_id, youtube_id, imdb_id}
  runtime_minutes int,
  artwork_url text,
  created_at timestamptz not null default now()
);

-- ===== shelves (the tier model lives here) =====
create table shelves (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  name text not null,
  slug text not null,
  tier smallint not null default 0 check (tier between 0 and 3),
  -- 0 public · 1 followers · 2 members · 3 invited
  unseal_at timestamptz,           -- non-null = time capsule
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references shelves on delete cascade,
  work_id uuid not null references works on delete restrict,
  why text not null check (char_length(why) <= 200),
  weight smallint not null default 2 check (weight between 1 and 3),
  highlighted boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (shelf_id, work_id)
);

create table notes (                    -- comments, hard-capped
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries on delete cascade,
  author_id uuid not null references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

-- ===== social & access =====
create table follows (
  follower_id uuid not null references profiles on delete cascade,
  followee_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles on delete cascade,
  curator_id uuid not null references profiles on delete cascade,
  status text not null check (status in ('active','past_due','canceled')),
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  unique (member_id, curator_id)
);

create table invites (                  -- tier 3
  shelf_id uuid not null references shelves on delete cascade,
  invitee_email citext not null,
  invitee_id uuid references profiles on delete cascade,
  primary key (shelf_id, invitee_email)
);

-- ===== availability cache =====
create table availability (
  work_id uuid not null references works on delete cascade,
  region text not null,
  payload jsonb not null,               -- normalised providers, source: justwatch via tmdb
  fetched_at timestamptz not null default now(),
  primary key (work_id, region)
);

create table stripe_events (            -- webhook idempotency
  id text primary key,
  processed_at timestamptz not null default now()
);
```

### RLS — the security boundary

Enable on every table. The shelf-visibility predicate is the heart of the system; get it right once and everything downstream inherits it.

```sql
alter table shelves enable row level security;

create or replace function can_view_shelf(s shelves) returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- capsules stay shut until their date
    (s.unseal_at is null or s.unseal_at <= now())
    and (
      s.tier = 0
      or s.owner_id = auth.uid()
      or (s.tier = 1 and exists (
            select 1 from follows f
            where f.follower_id = auth.uid() and f.followee_id = s.owner_id))
      or (s.tier = 2 and exists (
            select 1 from memberships m
            where m.member_id = auth.uid() and m.curator_id = s.owner_id
              and m.status = 'active'))
      or (s.tier = 3 and exists (
            select 1 from invites i
            where i.shelf_id = s.id and i.invitee_id = auth.uid()))
    );
$$;

create policy shelves_read on shelves for select using (can_view_shelf(shelves));
create policy shelves_write on shelves for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy entries_read on entries for select using (
  exists (select 1 from shelves s where s.id = entries.shelf_id and can_view_shelf(s)));
```

**Every one of those branches needs a test in `tests/rls/`** proving the *negative* case: a stranger gets zero rows, a follower gets zero rows from a tier-2 shelf, a sealed capsule returns nothing even to an invitee before `unseal_at`. Negative tests are the ones that matter; have the agent write them first, watch them fail, then write the policy.

---

## 8. Milestones

Each is one session, one PR. **Do not let the agent merge two.**

---

### M0 · Foundation
**Goal:** repo boots, CI green, nothing else.
**Prompt:**
> Read docs/PLAN.md §3–§5. Set up `CLAUDE.md`, `.claude/settings.json` with the permissions and the typecheck hook, prettier, vitest config, playwright config, and a GitHub Actions workflow running typecheck → lint → test → build. Add one trivial passing test. Do not add any product code.

**Done when:** `npm run typecheck && npm test && npm run build` all pass; CI green on a PR; `.env*` gitignored.

---

### M1 · Schema & RLS
**Goal:** the database, correct and provably locked down.
**Prompt:**
> Read §7. Create the migration for `profiles`, `works`, `shelves`, `entries`. Show me the SQL and stop. After I approve, apply it, enable RLS, add the `can_view_shelf` function and policies, generate types, and write `tests/rls/shelves.test.ts` covering all four tiers plus the capsule seal — negative cases first.

**Done when:** RLS tests pass; every table has `rowsecurity = true` (verify with a query, not by reading code); `database.types.ts` generated and committed.
**Then:** run the `security-reviewer` subagent over the diff.

---

### M2 · Auth & profile
**Goal:** sign up, claim a handle, get an empty canon page.
**Prompt:**
> Supabase Auth with magic link + Google. Middleware refreshing the session. Onboarding that claims a unique handle (validated client + server + DB constraint). Route `/[handle]` server-rendering the profile shell — 404 if no such handle. No styling beyond the design tokens.

**Done when:** you can sign up in a preview deploy and see `canon.so/<you>`.

---

### M3 · Entries & the text view
**Goal:** the actual product loop.
**Prompt:**
> Paste-a-link flow: server action takes a URL, resolves metadata via oEmbed/OpenGraph (YouTube first, then generic), upserts into `works`, creates an `entry` with why (≤200 chars) and weight. Render the farza-style text view on `/[handle]`, with the red "changed me" tier. Drag to reorder. Optimistic UI.

**Done when:** you build a 10-item canon in under 5 minutes, timed with a stopwatch. **If it takes longer, that's a bug — fix it before M4.**

---

### M4 · Availability layer ⚠️
**Goal:** every item shows where to watch, per region.
**Prompt:**
> Read §6 carefully — TMDB provider data has mandatory per-item JustWatch attribution and provides no deep links. Build `src/lib/availability.ts`: match a work to a TMDB id, fetch `/watch/providers`, normalise into `{flatrate, rent, buy, free}`, cache in the `availability` table and Redis for 24h. Region from the profile, overridable by a selector. Render availability chips with the required attribution, linking to the TMDB watch page. Handle "not available in this region" as a first-class state.

**Done when:** the same item shows different providers for `nz` vs `us`; attribution visible on every item; a cold fetch is <800ms and cached <50ms.

---

### M5 · The store (immersive) 🎨
**Goal:** the shareable moment.
**Prompt:**
> Port the CSS-3D store from `prototype/canon.html` into `src/components/store/`. Sections from weight tiers, bays left and right of the aisle, a "back room" door at the end. Keyboard (WASD/arrows), pointer-drag look, wheel walk, and large touch controls. Clicking a case opens a flip-card with the why and availability. Must include a "browse as a list instead" escape hatch, respect `prefers-reduced-motion` by disabling the walk animation, and never trap keyboard focus.

**Done when:** 50fps+ on a mid-range laptop with 60 cases; works on mobile touch; screenshot it with Playwright and run the `ui-critic` subagent.

---

### M6 · Tiers, follows, capsules
**Goal:** the storage metaphor becomes real functionality.
**Prompt:**
> Shelf creation with tier selection using the storage graphic from the prototype. Follow/unfollow. Capsule creation with `unseal_at` plus a Resend email on release (Vercel cron checking hourly). A locked shelf must render a teaser — item count and blurred titles — never the actual titles. Verify that with an RLS test, not just a UI check.

**Done when:** a logged-out visitor cannot retrieve tier-1/2/3 content via the API even with a hand-crafted request. Test it adversarially.

---

### M7 · Membership
**Goal:** money.
**Prompt:**
> Stripe Checkout for a $5/mo membership to a curator. Webhook handler with signature verification and idempotency via `stripe_events`. On `active`, tier-2 shelves unlock through existing RLS — do not add app-level checks. Billing portal for cancellation. Test-mode only; no Connect yet.

**Done when:** the full subscribe → unlock → cancel → re-lock cycle works in Stripe test mode, and replaying a webhook twice changes nothing.

---

### M8 · Regional archive + capsule polish
**Goal:** the SEO surface and the emotional hook.
**Prompt:**
> Static-generate `/archive/[region]/[year]` from a seeded dataset with `source_url` and `licence` per row. Animated bars. Cross-link entries to the archive where titles match.

**Done when:** pages are statically generated, Lighthouse SEO ≥95, every data row carries a source.

---

### M9 · Launch hardening
**Prompt:**
> Sentry, PostHog with the two gate events (`canon_completed`, `canon_shared`), OG image generation per canon (`@vercel/og`), rate limiting on writes, `robots.txt`/`sitemap.xml`, an accessibility pass (keyboard nav, focus rings, contrast, alt text), and a full `npm audit` review.

**Done when:** Lighthouse ≥90 across the board, no critical Sentry issues in 48h of self-use.

---

## 9. Testing strategy

Three tiers, in descending order of importance to *this* product:

1. **RLS tests (`tests/rls/`)** — the highest-value tests you will write. Each runs as an anonymous client, a follower, a member, and a stranger, asserting exact row counts. If the agent ever "fixes" a failing RLS test by loosening a policy, that's a critical incident — say so in `CLAUDE.md`.
2. **E2E (`tests/e2e/`)** — four flows: build a canon; view someone else's; membership unlock; walk the store.
3. **Unit (`src/**/*.test.ts`)** — availability normalisation, URL/metadata parsing, the 300-char note rule, tier resolution. Pure functions only.

**The 300-character rule must be enforced in three places** — DB `CHECK`, zod schema, and the textarea `maxLength` — with a test for each. Belt, braces, and a third thing.

---

## 10. CI/CD

- **PR** → typecheck, lint, unit, build, e2e against a Vercel preview. Branch protection on `main`.
- **Migrations** → applied manually by you, never by CI, never by the agent. `supabase db push` is in the deny list for a reason: an agent that can silently alter production schema is an agent that will eventually drop a column.
- **Rollback plan** → Vercel instant rollback for app code; a nightly `pg_dump` to object storage for data. Test the restore once, before launch, so you know it works.

---

## 11. Measure only what decides something

Two metrics gate whether the social layer ever gets built:

- **Creation completion** — of users who start a canon, what % reach 5+ items? *Target ≥40%.*
- **Share rate** — of users who create a canon, what % share the link within 7 days? *Target ≥20%.*

If share rate is under 10% after 500 canons, the identity thesis is wrong — stop and pivot toward the utility/tracker angle rather than building the feed.

**Cost at low scale** (all free tiers except domain): roughly **$2–35/mo** until ~10K users, rising to **~$70–170/mo** at 50K. Vercel Pro ($20) and Supabase Pro ($25) are the first two paid steps. This is the reason the link-only architecture matters — no media storage, no transcoding, no moderation infrastructure.

---

## 12. Design principles (give these to the `ui-critic` subagent)

Agents drift toward generic UI unless told not to. Explicitly:

- **Do:** warm paper + phosphor palette; Newsreader serif for voice, IBM Plex Mono for machine text; film grain; typography doing the heavy lifting; lowercase copy; generous whitespace.
- **Do not:** purple/blue gradients, glassmorphism, "Elevate your experience" hero copy, emoji in UI labels, rounded-2xl-shadow-lg cards everywhere, three-column feature grids with icons.
- **Test:** if a screenshot could belong to any other SaaS product, it's wrong.

---

## 13. Risk register

| Risk | Likelihood | Response |
|---|---|---|
| Agent ships an RLS hole | Medium | Negative-case tests, `security-reviewer` after every access-control milestone, adversarial manual check at M6 |
| TMDB revokes access over attribution | Low, severe | Attribution built in from M4, never bolted on |
| Store tanks performance on mobile | Medium | List view is always the fallback; perf budget checked at M5 |
| Scope creep into the feed/social layer | **High** | The two gate metrics decide it. Not vibes. |
| Agent context rot → contradictory code | Medium | One milestone per session, `/clear`, `docs/PROGRESS.md` as durable memory |
| Solo burnout | **High** | Milestones sized to one sitting. M0–M4 is a shippable product; M5–M9 are optional upside |
| Stripe webhook double-charge | Low | Idempotency table, replay test in M7 |

---

## 14. Prompt library

**Starting a session**
> Read `docs/PLAN.md` and `docs/PROGRESS.md`. We're on M<n>. Enter plan mode and propose an approach before writing code. List the files you'll touch and the tests you'll write first.

**Ending a session**
> Update `docs/PROGRESS.md`: what shipped, what's stubbed, what surprised you, what the next session needs to know. Then commit with a conventional-commit message and open a PR with a summary and test plan.

**When something looks wrong** (attach a screenshot)
> This is what it renders. Here's what I expected: <…>. Diagnose before changing anything — tell me the cause first.

**Before merging anything touching access control**
> Use the security-reviewer subagent on this diff. Focus on RLS coverage, service-role key leakage, webhook verification, and IDOR.

**When it's over-engineering** (you will need this)
> Stop. This is more abstraction than the problem needs. Delete the layer and write the simplest thing that passes the tests.

---

## Sources
- [TMDB Watch Providers reference](https://developer.themoviedb.org/reference/movie-watch-providers) · [TMDB: attributing JustWatch for watch/providers](https://www.themoviedb.org/talk/60355e30a284eb003da676f2) · [TMDB: no deep links returned](https://www.themoviedb.org/talk/6126a7c09a358d0091aa73ea)
- [JustWatch API documentation](https://apis.justwatch.com/docs/api/)
- [Bingebuster](https://bingebuster.net/) · [MyRetroTVs](https://www.myretrotvs.com/) · [farza.com/content](https://farza.com/content)
