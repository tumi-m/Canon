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
- **`/[handle]`** — a canon, in two views. **The wall** (default) is image-led
  and quiet: YouTube's own artwork, big tiles, a lot of air, and the *why* on
  the tile rather than hidden behind a hover. **The list** is the reading view.
  Both are statically generated, server-rendered, and fully readable with
  javascript switched off — view and region are query params, so any way of
  looking at a canon is a URL you can send somebody.
- **the room** — somebody's den, opened from a canon: shelves, a record crate,
  a CD wallet on the coffee table, a shoebox of sticks, and a television that
  plays the canon.

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
src/lib/youtube.ts     id parsing, embeds, thumbnails, the channel dial
src/lib/roomSound.ts   procedural footsteps — no assets, off by default
src/components/room/   the walkable den — world.ts is geometry, Room.tsx draws it
prototype/canon.html   the original single-file prototype, kept as reference
```

### The availability layer

TMDB's provider data is powered by JustWatch, and two of its constraints are
built into the shape of `src/lib/availability.ts` rather than bolted on later,
because retrofitting them across a 3D room is miserable:

1. **No deep links.** TMDB returns none, so an offer carries a TMDB watch page
   and never a synthesised `netflix.com` URL. A test asserts this.
2. **Per-item attribution.** The JustWatch/TMDB credit is required on *every*
   item showing provider data, not once in a footer — non-compliance costs API
   access. The credit rides on the offer object so a later refactor cannot drop
   it, and both the unit and e2e suites check it.

The seed table stands in for the live response. M4 replaces the data, not the
callers.

### The room

Not a shop — somebody's den, built entirely from CSS 3D transforms. No WebGL,
no Three.js, no bundle. The canon is shelved the way a collection actually
lives: a bookcase on the back wall for the ones that changed you, shelves along
the side walls, record crates leaning on the rug, a CD wallet open on the
coffee table, a shoebox of USB sticks under the side table. Lamps, floorboards,
dust in the light.

| | |
|---|---|
| walk | `W A S D` / arrows, or hold the on-screen pad |
| look | click to capture the mouse, or drag; touch drags to look |
| take something off the shelf | `E` / `Enter`, or click while the reticle is on it |
| leave | `Esc` (once to release the mouse, again to leave) |

The camera is a real one: continuous acceleration, head bob, collision against
every piece of furniture, and a reticle that resolves what you are looking at
by projecting each sleeve into camera space.

**How it is put together.** Geometry lives in `world.ts` as pure functions —
world-space positions, collision boxes, the aim test — and is unit-tested
without a browser. `Room.tsx` draws that description and runs the camera. The
world is authored in plain world coordinates (`+x` right, `-z` further in, `+y`
down, eye at `y=0`) and the `.world` element carries the inverse camera
transform. A face turned by θ about Y maps its local `+x` to
`(cos θ, 0, −sin θ)`, so one formula places the back wall, both side walls, and
anything angled into the room.

Three things are worth knowing before editing it, because each one cost a
debugging session:

1. **CSS 3D has no depth buffer.** Siblings are painted in sorted order and ties
   fall back to DOM order, so anything sharing a `z` with the furniture it sits
   on has to be nudged deliberately proud of it.
2. **The eye plane is fixed at the `perspective` distance.** Anything that
   straddles it magnifies toward infinity and smears across the view. That is
   what the cull pass is for, and why the room is bigger than a real one — you
   must not be able to press your nose against a wall.
3. **Sleeve positions are arithmetic, not measurement.** Reading
   `offsetLeft`/`offsetTop` silently returns zero inside a `display:none`
   subtree, which collapses every sleeve onto its shelf's centre and leaves the
   reticle nothing to hit. A test asserts the rendered markup agrees with the
   model.

### The television

The room has a set, and it plays the canon. Every entry with an embeddable
video becomes a channel; `T` turns it on, `[` and `]` work the dial, `M` mutes.
Surfing somebody's canon is the MyRetroTVs trick made personal — instead of a
generic decade, you are channel-hopping the things that shaped one person.

Three deliberate constraints:

- **Official iframe embed only** — never proxied, never rehosted, so the view
  counts for whoever made it. `youtube-nocookie.com`, related videos off: this
  is a shelf, not a feed.
- **It starts muted**, because browsers block autoplay with sound. Unmuting is
  one key, and the HUD says so.
- **The embed takes no pointer events.** The dial lives on the HUD, which keeps
  pointer lock working and makes surfing feel like a television rather than a
  web page.

A link with no video — a Wikipedia page, a film — gets no channel. The set says
`NO SIGNAL` rather than showing a dead screen.

### Sound: what the room does and does not make

The content's sound is YouTube's job. A soundtrack would fight the thing you
came to watch, so there isn't one.

What was missing is *room* feedback, so `src/lib/roomSound.ts` synthesises it
in a few hundred bytes of Web Audio: footsteps on floorboards paced by distance
walked, a click when something comes off the shelf, and a whisper of room tone.
No audio files, nothing downloaded. It is **off by default** — nobody's first
second on a page should be noise — it can only start from a user gesture
because browsers require one, and it ducks itself out of the way whenever the
television is on.

**Getting out.** The room is an enhancement, never a requirement. `☰ read it as
a list` returns you to the canon, and `prefers-reduced-motion` disables head
bob, camera roll and dust drift.

**Keyboard.** The room portals to `<body>` and makes everything else `inert`,
so Tab cycles its own controls instead of wandering into the canon behind it;
the flip card does the same to the HUD. `Esc` unwinds one layer at a time —
card, then mouse capture, then the room — and leaving returns focus to whatever
opened it. Contained while you are in it, never a trap.

**Set dressing.** The unlabelled sleeves in the CD wallet and the shoebox are
the household's own clutter — deliberately anonymous, non-interactive, and
never canon entries.

---

## Who gets in

Canon is not a public feed and has no follower counts. A room is yours, and you
name who walks into it. `src/lib/schema.ts` carries the four audiences —
`private`, `invited`, `household`, `everyone` — and a new profile defaults to
**invited**, not to the internet.

Alongside them is the capsule: a shelf sealed until a date and addressed to
named people. A capsule for a child's eighteenth, or for whoever is still here
afterwards. Sealed means sealed — before its date nobody sees the contents,
including the people it is for.

**None of this is enforced yet, and the schema says so in as many words.**
These shapes exist so the UI and the API agree with the database. Row Level
Security is the security boundary, the `can_view_shelf` predicate in
`docs/PLAN.md` §7 is where the rule actually lives, and neither exists until
M1. Until then a canon is a static object and the room's capsule door only
explains itself.

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

`npm test` covers the pure layer: YouTube id parsing and the channel dial,
runtime parsing, the availability rules above,
the character caps, the audience and capsule rules, and the room's geometry —
shelf layout, collision,
projection and the aim test.

`npm run test:e2e` covers the paths that matter today: reading someone's canon,
a handle that does not exist, per-region providers with attribution, walking the
room, focus containment, the list escape hatch, and taking something off the
shelf. The two remaining critical paths — creating a canon, and a capsule
staying sealed against a hand-crafted request — arrive with M3 and M6, because
both need the database.

**Two things this environment could not verify.** YouTube's CDN is unreachable
from the sandbox this was built in, so **no thumbnail and no embed has been
seen to load** — the wiring is tested (ids, embed URLs, channel numbering,
fallbacks) but the network path is not. That is why a thumbnail that fails
falls back to the title rather than a broken-image glyph, and it is worth a
look on the first real deploy.

**Frame rate is unverified.** This was built and driven headless, where Chromium
software-rasterises at a few fps, so no honest number is available. The
simulation costs ~0.04ms a frame; the budget is entirely paint and composite.
The M5 target of 50fps needs checking on real hardware.
