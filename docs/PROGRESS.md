# PROGRESS

Durable memory between sessions. Read this and `docs/PLAN.md` before starting a
milestone; update it before finishing one.

---

## Where the build is

| Milestone | State |
|---|---|
| **M0 · Foundation** | ✅ done |
| **M1 · Schema & RLS** | ⬜ not started — **blocked**: needs a Supabase project |
| **M2 · Auth & profile** | ⬜ not started — blocked on M1 |
| **M3 · Entries & the text view** | 🟡 the *view* is built and server-rendered; the paste-a-link flow, metadata resolution and reordering are not — they need M1/M2 |
| **M4 · Availability layer** | 🟡 the shape is built (per-region offers, per-item attribution, no synthesised deep links); the live TMDB fetch and Redis cache are not — **blocked**: needs `TMDB_API_KEY` |
| **M5 · The room** | ✅ ported to React and shipping — reframed from a video shop to a den |
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
- `/[handle]` → **the room** — a walkable CSS-3D den: a bookcase for the ones
  that changed you, shelves along the walls, record crates on the rug, a CD
  wallet on the coffee table, a shoebox of sticks. Lives in
  `src/components/room/` and mounts on demand, so it costs nothing to anyone
  who never opens it.

**The sharing model,** as shapes only. Canon is not a public feed: a room is
yours and you name who walks into it. `audienceSchema` carries `private` /
`invited` / `household` / `everyone`, a new profile defaults to **invited**, and
`capsuleSchema` describes a shelf sealed until a date and addressed to named
people — the thing a canon leaves behind.

## What is deliberately *not* built

Everything that needs a credential I do not have. There are no Supabase, Stripe
or TMDB stubs pretending to work — a fake auth flow is worse than none, because
it looks finished.

Specifically: no `profiles`/`works`/`shelves`/`entries` tables, **no RLS**, no
sign-in, no writes of any kind, no payments. The canon is a static object in
`src/lib/canon.ts`, parsed through the same zod schema an API write will use.

**The audiences and the capsule are intent, not enforcement**, and the schema
says so in its own docblock. Nothing in `src/lib/` keeps anybody out of
anything. A capsule that is only sealed in a component is not sealed.

## What the next session needs to know

1. **M1 is the next milestone**, and it is the one that matters. Nothing in
   `src/lib/schema.ts` is the security boundary — RLS is. The zod schemas exist
   so the API and the UI agree with the DB, not instead of it.
2. **The audience model needs the RLS predicate, not a component.** The four
   audiences map onto the `tier` column and `can_view_shelf` in PLAN §7:
   `private` → owner only, `invited` → the invite list, `household` → a shared
   canon's members, `everyone` → tier 0. The capsule adds the `unseal_at` clause
   the plan already has — and the negative test that matters is that an invitee
   gets **zero rows** from a capsule before its date, not a blurred teaser.
3. **The three-place rule is half-wired.** `WHY_MAX` (200) and `NOTE_MAX` (300)
   live in `src/lib/schema.ts` and are used by the schema and the UI. The M1
   migration must carry the same numbers as `CHECK` constraints — that is the
   third place, and it is the one that counts.
4. **`src/lib/availability.ts` is shaped for the real TMDB response.** M4
   replaces the seed table, not the callers. Two things must survive that swap:
   the per-item JustWatch credit (`ATTRIBUTION`, asserted in both the unit and
   e2e suites) and the rule that a click target is a TMDB watch page, never a
   synthesised provider deep link.
5. **The room's geometry is pure and tested** (`src/components/room/world.ts`).
   Three CSS-3D traps are documented in the README and encoded as tests — no
   depth buffer, the fixed eye plane, and the fact that the world is authored in
   arithmetic rather than measured off the DOM. Read those before moving props.
6. **Frame rate is still unverified.** Everything so far has been driven headless,
   where Chromium software-rasterises at a few fps. The M5 target of 50fps needs
   checking on real hardware before M5 is called done.
