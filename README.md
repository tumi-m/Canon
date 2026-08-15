# canon.

**the content that made you.**

One page per person listing the content that shaped them — each item a link, a
one-line *why*, a weight, and where it is actually streamable in that visitor's
region. Not a feed. A profile.

The one-sentence pitch: *Letterboxd for everything, Linktree for taste.*

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables are needed yet — the app runs on seed data until the
database lands in M1. Copy `.env.example` to `.env.local` when that changes.

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` · `npm start` | production build and serve |
| `npm run typecheck` · `npm run lint` | tsc strict, eslint |
| `npm test` | vitest — the pure layer |
| `npm run test:e2e` | playwright — the critical paths |

Deploying to Vercel needs no configuration: import the repo and it builds. CI
runs typecheck → lint → test → build → e2e on every push and PR.

---

## What is built

- **`/`** — the front.
- **`/[handle]`** — a canon. Statically generated, server-rendered, and fully
  readable with javascript switched off. Region is a query param
  (`?region=us`), so changing region is a plain link and the result is
  shareable.
- **the store** — a walkable video shop, opened from a canon.

**What is deliberately not built:** anything needing a credential this build
does not have — Supabase, Stripe, TMDB. There are no stubs pretending to work;
a fake sign-in is worse than none, because it looks finished. So: no tables, no
RLS, no auth, no writes, no payments. A canon is a static object in
`src/lib/canon.ts`, parsed through the same zod schema an API write will use.

`docs/PROGRESS.md` has the milestone-by-milestone state and what the next
session needs to know. `docs/PLAN.md` is the spec; `docs/BUSINESS.md` the case.

---

## Layout

```
src/app/               routes — server components by default
src/lib/schema.ts      zod shapes, and the two character caps
src/lib/canon.ts       the seed canon
src/lib/availability.ts  where a thing can be watched, per region
src/lib/runtime.ts     "1hr 47m" → minutes, and back
src/components/store/  the walkable shop — world.ts is geometry, Store.tsx draws it
prototype/canon.html   the original single-file prototype, kept as reference
```

### The availability layer

TMDB's provider data is powered by JustWatch, and two of its constraints are
built into the shape of `src/lib/availability.ts` rather than bolted on later,
because retrofitting them across a 3D store is miserable:

1. **No deep links.** TMDB returns none, so an offer carries a TMDB watch page
   and never a synthesised `netflix.com` URL. A test asserts this.
2. **Per-item attribution.** The JustWatch/TMDB credit is required on *every*
   item showing provider data, not once in a footer — non-compliance costs API
   access. The credit rides on the offer object so a later refactor cannot drop
   it, and both the unit and e2e suites check it.

The seed table stands in for the live response. M4 replaces the data, not the
callers.

### The store

A first-person walkable video shop built entirely from CSS 3D transforms — no
WebGL, no Three.js, no bundle. The canon is shelved by weight: an aisle per
tier, free-standing island units either side of the main aisle, the shop's own
stock on their backs and along the walls, and the members-only back room at the
far end.

| | |
|---|---|
| walk | `W A S D` / arrows, or hold the on-screen pad |
| look | click to capture the mouse, or drag; touch drags to look |
| pick a case off the shelf | `E` / `Enter`, or click while the reticle is on it |
| leave | `Esc` (once to release the mouse, again to leave) |

The camera is a real one: continuous acceleration, head bob, collision against
every shelf unit and the counter, and a reticle that resolves what you are
looking at by projecting each case into camera space.

**How it is put together.** Geometry lives in `world.ts` as pure functions —
world-space positions, collision boxes, the aim test — and is unit-tested
without a browser. `Store.tsx` draws that description and runs the camera.
The world is authored in plain world coordinates (`+x` right, `-z` deeper into
the shop, `+y` down, eye at `y=0`) and the `.world` element carries the inverse
camera transform.

Three things are worth knowing before editing it, because each one cost a
debugging session:

1. **CSS 3D has no depth buffer.** Siblings are painted in sorted order and ties
   fall back to DOM order. Aisle signs share a `z` with the shelving they hang
   over, so they sit deliberately proud of it — there is a test for that.
2. **The eye plane is fixed at the `perspective` distance.** Anything that
   straddles it magnifies toward infinity and smears across the view. That is
   what the cull pass is for, why the storefront sits further back than the
   perspective distance, and why the floor light-pool planes were cut.
3. **Case positions are arithmetic, not measurement.** The prototype read
   `offsetLeft`/`offsetTop`, which silently returns zero inside a
   `display:none` subtree — collapsing every case onto its shelf's centre and
   leaving the reticle nothing to hit. `world.ts` computes them, and a test
   asserts the rendered markup agrees with the model.

**Getting out.** The store is an enhancement, never a requirement. `☰ list
instead` returns you to the canon, and `prefers-reduced-motion` disables head
bob, camera roll and dust drift.

**Keyboard.** The store portals to `<body>` and makes everything else `inert`,
so Tab cycles its own controls instead of wandering into the canon behind the
aisle; the flip card does the same to the HUD. `Esc` unwinds one layer at a
time — card, then mouse capture, then the store — and leaving returns focus to
whatever opened it. Contained while you are in it, never a trap.

**Set dressing.** The unlabelled cases filling the wall bays and the backs of
the islands are the shop's background stock — deliberately anonymous,
non-interactive, and never canon entries.

---

## Design

Analog futurism: warm paper × phosphor. Newsreader for voice, IBM Plex Mono for
machine text, film grain over everything. Lowercase, warm, plain copy — "the
content that made you", not "curate your media journey".

No purple gradients, no glassmorphism, no rounded-2xl-shadow-lg cards. The test
in `docs/PLAN.md` §12: if a screenshot could belong to any other SaaS product,
it is wrong.

Every colour is a CSS custom property in `src/app/globals.css` — `--paper`,
`--ink`, `--red`, `--phos`. Components use the token, never a hex. That is what
makes the night-CRT mode and the generative-UI themes a token swap rather than a
rewrite.

---

## Testing

`npm test` covers the pure layer: runtime parsing, the availability rules above,
the character caps, and the store's geometry — sections, shelf layout, collision,
projection and the aim test.

`npm run test:e2e` covers the paths that matter today: reading someone's canon,
a handle that does not exist, per-region providers with attribution, walking the
store, focus containment, the list escape hatch, and opening a case. The two
remaining critical paths from PLAN §9 — creating a canon and a membership
unlock — arrive with M3 and M7.

**Frame rate is unverified.** This was built and driven headless, where Chromium
software-rasterises at a few fps, so no honest number is available. The
simulation costs ~0.04ms a frame; the budget is entirely paint and composite.
The M5 target of 50fps with 60 cases needs checking on real hardware.
