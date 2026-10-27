# PROGRESS

Durable memory between sessions. Read this and `docs/PLAN.md` before starting a
milestone; update it before finishing one.

---

## Where the build is

| Milestone | State |
|---|---|
| **M0 · Foundation** | ✅ done |
| **M1 · Schema & RLS** | 🟡 the migration is **approved**, and its row level security is **proved against a real Postgres** (`tests/rls/`, 19 tests, in CI). **Not applied to Supabase yet** — that is `npx supabase db push`, by hand, once a project exists; then generate `database.types.ts` |
| **M2 · Auth & profile** | 🟡 **built**: Google, Apple and email-link sign-in, claiming a handle, the account page, `/[handle]` resolving accounts. **Switched off until the Supabase keys are set** in Vercel and the providers configured (README → Accounts) |
| **M3 · Entries & the text view** | 🟡 the view is built and server-rendered. The **add-a-link flow is built end to end but saves drafts to the browser only** (`src/lib/drafts.ts`) — the save needs M1/M2. Metadata resolution and reordering are not built |
| **M3.5 · YouTube** | ✅ id parsing, embeds, thumbnails, and the channel dial in the room |
| **M4 · Availability layer** | 🟡 the shape is built (per-region offers, per-item attribution, no synthesised deep links); the live TMDB fetch and Redis cache are not — **blocked**: needs `TMDB_API_KEY` |
| **M5 · The room** | ✅ shipping — a lived-in den drawn with three.js: furniture, a fire, a memory palace over the mantel, five venues, the television on a 90s monitor, point-and-click mouse, bloom and ambient occlusion, a path-traced still when you stand still, air that keeps moving over it; loaded only when opened |
| **M6 · Audiences, invites, capsules** | 🟡 the *shapes* exist in `src/lib/schema.ts`; **nothing is enforced** — blocked on M1 |
| **M7 · Membership** | ⬜ not started — **blocked**: needs Stripe keys |
| **M8 · Regional archive** | ⬜ not started |
| **M9 · Launch hardening** | ⬜ not started |

## What shipped

**M0.** Next.js 15 App Router, TypeScript strict (plus `noUncheckedIndexedAccess`),
Tailwind v4, zod. Vitest for units, Playwright for e2e, GitHub Actions running
typecheck → lint → test → build → e2e. `.claude/settings.json` carries the
permissions and the typecheck hook from PLAN §5.

**The presentational product,** built ahead of its milestones because it needs no
accounts:

- `/` — the front, listing the canons that exist
- `/[handle]` — a canon, statically generated, server-rendered, readable with
  javascript switched off. Region is a query param (`?region=us`), so switching
  region is a plain link and stays shareable.
- `/[handle]` → **the room** — a walkable den drawn with three.js: a living
  room with the canon shelved through it, the pieces that changed you most
  framed over the fire with their whys beside them (the memory palace), the
  television, a clock telling the real time. Moving, it is rasterised with
  bloom and ambient occlusion; standing still, `three-gpu-pathtracer`
  develops it into a ray-traced still; the air — fire, embers, steam, the
  moonbeam, dust — is drawn over either and never stops. Lives in
  `src/components/room/` and mounts on demand, so it costs nothing to anyone
  who never opens it; the tracer is fetched only when first used. The
  renderer moved off CSS 3D because every bug the old one grew came from
  having no depth buffer, no lights and a fixed eye plane; `world.ts`, the
  model, did not change.

**Accounts (M2), behind the Supabase keys.** Sign in with Google, Apple or an
email link; claim a handle, checked in the browser, on the server and by the
database; an account page to keep your name, line and region, and sign out;
`/[handle]` resolving an account's canon. Middleware keeps sessions alive and
leaves visitors without one alone. **The schema (M1)** is approved and its row
level security proved against a real Postgres in `tests/rls/`.

**The sharing model,** as shapes only. Canon is not a public feed: a room is
yours and you name who walks into it. `audienceSchema` carries `private` /
`invited` / `household` / `everyone`, a new profile defaults to **invited**, and
`capsuleSchema` describes a shelf sealed until a date and addressed to named
people — the thing a canon leaves behind.

**The television and the wall.** Every embeddable entry is a channel you can
surf from inside the room (official iframe, muted start, HUD dial). The profile
gained a second view — the wall — which is image-led and uses YouTube's own
thumbnail CDN. Room sound is synthesised, off by default, and ducks under the
television.

## What is deliberately *not* built

Everything that needs a credential I do not have, and everything past M2.
There are no Stripe or TMDB stubs pretending to work, and accounts stay
switched off — no sign-in link anywhere — until a real Supabase project's
keys are set: a fake auth flow is worse than none, because it looks finished.

Specifically: the migration is not applied to any Supabase project yet; no
shelves or entries are written to the database (M3) — an account's canon is
the person and an empty room, and what they add is a draft on their device;
no account deletion yet (it needs the service-role key, which belongs in
`src/lib/supabase/admin.ts` only, and was not needed for anything else); no
payments. The seed canon is a static object in `src/lib/canon.ts`, parsed
through the same zod schema an API write will use.

**The audiences and the capsule are enforced by the database's row level
security, not by the app** — and that is now proved in `tests/rls/`. Nothing
in `src/lib/` keeps anybody out of anything, by design: a capsule that is only
sealed in a component is not sealed.

## What the next session needs to know

1. **Accounts are built and waiting on the project's owner**, in this order:
   a Supabase project, the migration applied (`npx supabase db push` — in the
   agent's deny list on purpose), the two public keys in Vercel and a
   redeploy, the redirect URLs, then the Google and Apple providers. README →
   Accounts has each step. The Apple client secret expires after at most six
   months; somebody has to renew it.
2. **Then regenerate the types.** `src/lib/database.types.ts` is written by
   hand from the migration because there was no project to generate it from.
   Replace it with `npx supabase gen types typescript --linked` and fix what
   the compiler finds.
3. **M3 is next once accounts are live**: shelves and entries in the
   database, and moving a person's drafts out of `localStorage` into their
   canon. An account's canon is empty until then.
4. **The RLS suite runs anywhere with Postgres** — `RLS_DATABASE_URL` points it
   at a server, and it makes and drops a database of its own there, so it
   never reads or touches existing data. Any change to access control gets a
   negative test there first; check it goes red against a broken policy before
   trusting it green.
5. **M1 is the one that matters.** Nothing in
   `src/lib/schema.ts` is the security boundary — RLS is. The zod schemas exist
   so the API and the UI agree with the DB, not instead of it.
6. **The audience model needs the RLS predicate, not a component.** The four
   audiences map onto the `tier` column and `can_view_shelf` in PLAN §7:
   `private` → owner only, `invited` → the invite list, `household` → a shared
   canon's members, `everyone` → tier 0. The capsule adds the `unseal_at` clause
   the plan already has — and the negative test that matters is that an invitee
   gets **zero rows** from a capsule before its date, not a blurred teaser.
7. **The three-place rule is wired.** `WHY_MAX` (200) and `NOTE_MAX` (300)
   live in `src/lib/schema.ts` and are used by the schema and the UI; the
   migration carries the same numbers as `CHECK` constraints, and the RLS
   suite checks the database refuses 201 and 301. Handles follow the same
   rule: input attributes, `claimHandleSchema`, and the database.
8. **`src/lib/availability.ts` is shaped for the real TMDB response.** M4
   replaces the seed table, not the callers. Two things must survive that swap:
   the per-item JustWatch credit (`ATTRIBUTION`, asserted in both the unit and
   e2e suites) and the rule that a click target is a TMDB watch page, never a
   synthesised provider deep link.
9. **The room's model is pure and tested** (`src/components/room/world.ts`),
   and the renderer is `scene.ts`. The README lists nine traps that each cost
   a session — `world.ts` is `+y` down and three.js `+y` up, lights are in
   candela at the room's scale, shadows are drawn once, one material per
   mesh for the tracer, never two draws into a multisampled target, leave the
   tracer's `transmissiveBounces` alone — read those before moving anything.
10. **The path tracer works round two of its own bugs**, both in
   `three-gpu-pathtracer@0.0.24`: it mis-files materials after any mesh with
   a material array, and it under-sizes its random-number table when the
   bounce counts are lowered. If the dependency is upgraded, those
   workarounds are worth re-checking rather than assuming; and its own
   `dispose()` leaves its scene on the GPU, so `trace.ts` frees that itself.
11. **The layout is tested against canons of every size, not just the seed
   one.** `world.test.ts` generates canons from one piece a tier to forty and
   checks that nothing leaves the room, nothing stands inside anything else
   and every piece is shelved. When profiles come from the database, that is
   the test that says a real person's canon will fit.
12. **Adding a link works, but only as a local draft.** The form, the signs
   in the room and the "on this device" panel are real; what they save goes
   to `localStorage` under `canon:drafts:<handle>`, is re-validated whenever
   it is read back, and is labelled a draft everywhere it appears. When M2
   lands, `newLinkSchema` is already the input shape for the server action:
   swap `saveDrafts` for the action, and offer to move existing drafts into
   the signed-in person's canon. Do not let a draft look saved before then.
13. **Commit before you stop.** A whole session's renderer rewrite was once
   lost uncommitted when the cloud container was reclaimed, and had to be
   rebuilt from the transcript. Push at every green point.
14. **What this environment could not verify.** No real Google, Apple or
    email sign-in has been completed: there is no Supabase project, and the
    providers cannot be driven from a test. Everything up to the hand-off,
    and every failure path, is covered by `accounts.on.spec.ts`. Beyond that: YouTube's CDN is
    unreachable from the sandbox, so no thumbnail has been seen to load here
    (the embed has: a production screenshot showed it playing on the big
    screen). Frame rate on real hardware is unmeasured: everything has been
    driven headless on a software rasteriser, which the room detects and
    gives the plain picture. Bloom, ambient occlusion and the path tracer
    were checked by telling the room the GPU was real — correct, but at
    seconds a frame — so how fast a print develops on an actual graphics
    card, and whether the 320-pass cap and tile counts are right for one,
    want a look on the first real deploy.
