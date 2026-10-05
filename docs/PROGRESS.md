# PROGRESS

Durable memory between sessions. Read this and `docs/PLAN.md` before starting a
milestone; update it before finishing one.

---

## Where the build is

| Milestone | State |
|---|---|
| **M0 · Foundation** | ✅ done |
| **M1 · Schema & RLS** | 🟡 the migration is **written and waiting for your approval** at `supabase/migrations/0001_canon_init.sql` — not applied, per CLAUDE.md #2. Applying it needs a Supabase project |
| **M2 · Auth & profile** | ⬜ not started — blocked on M1. Sign-in is the next real feature and needs the database first |
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

1. **M1 is the next milestone, and the SQL is already written.** Read
   `supabase/migrations/0001_canon_init.sql`, check the two things its header
   asks you to check, then apply it yourself — `supabase db push` is in the
   agent's deny list on purpose. Sign-in (M2) cannot start before it.
2. **M1 is the one that matters.** Nothing in
   `src/lib/schema.ts` is the security boundary — RLS is. The zod schemas exist
   so the API and the UI agree with the DB, not instead of it.
3. **The audience model needs the RLS predicate, not a component.** The four
   audiences map onto the `tier` column and `can_view_shelf` in PLAN §7:
   `private` → owner only, `invited` → the invite list, `household` → a shared
   canon's members, `everyone` → tier 0. The capsule adds the `unseal_at` clause
   the plan already has — and the negative test that matters is that an invitee
   gets **zero rows** from a capsule before its date, not a blurred teaser.
4. **The three-place rule is half-wired.** `WHY_MAX` (200) and `NOTE_MAX` (300)
   live in `src/lib/schema.ts` and are used by the schema and the UI. The M1
   migration must carry the same numbers as `CHECK` constraints — that is the
   third place, and it is the one that counts.
5. **`src/lib/availability.ts` is shaped for the real TMDB response.** M4
   replaces the seed table, not the callers. Two things must survive that swap:
   the per-item JustWatch credit (`ATTRIBUTION`, asserted in both the unit and
   e2e suites) and the rule that a click target is a TMDB watch page, never a
   synthesised provider deep link.
6. **The room's model is pure and tested** (`src/components/room/world.ts`),
   and the renderer is `scene.ts`. The README lists nine traps that each cost
   a session — `world.ts` is `+y` down and three.js `+y` up, lights are in
   candela at the room's scale, shadows are drawn once, one material per
   mesh for the tracer, never two draws into a multisampled target, leave the
   tracer's `transmissiveBounces` alone — read those before moving anything.
7. **The path tracer works round two of its own bugs**, both in
   `three-gpu-pathtracer@0.0.24`: it mis-files materials after any mesh with
   a material array, and it under-sizes its random-number table when the
   bounce counts are lowered. If the dependency is upgraded, those
   workarounds are worth re-checking rather than assuming; and its own
   `dispose()` leaves its scene on the GPU, so `trace.ts` frees that itself.
8. **The layout is tested against canons of every size, not just the seed
   one.** `world.test.ts` generates canons from one piece a tier to forty and
   checks that nothing leaves the room, nothing stands inside anything else
   and every piece is shelved. When profiles come from the database, that is
   the test that says a real person's canon will fit.
9. **Adding a link works, but only as a local draft.** The form, the signs
   in the room and the "on this device" panel are real; what they save goes
   to `localStorage` under `canon:drafts:<handle>`, is re-validated whenever
   it is read back, and is labelled a draft everywhere it appears. When M2
   lands, `newLinkSchema` is already the input shape for the server action:
   swap `saveDrafts` for the action, and offer to move existing drafts into
   the signed-in person's canon. Do not let a draft look saved before then.
10. **Commit before you stop.** A whole session's renderer rewrite was once
   lost uncommitted when the cloud container was reclaimed, and had to be
   rebuilt from the transcript. Push at every green point.
11. **What this environment could not verify.** YouTube's CDN is
    unreachable from the sandbox, so no thumbnail has been seen to load here
    (the embed has: a production screenshot showed it playing on the big
    screen). Frame rate on real hardware is unmeasured: everything has been
    driven headless on a software rasteriser, which the room detects and
    gives the plain picture. Bloom, ambient occlusion and the path tracer
    were checked by telling the room the GPU was real — correct, but at
    seconds a frame — so how fast a print develops on an actual graphics
    card, and whether the 320-pass cap and tile counts are right for one,
    want a look on the first real deploy.
