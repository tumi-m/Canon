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

Deploying to Vercel: import the repo and it builds. `vercel.json` pins
`"framework": "nextjs"` — without it, a project whose Framework Preset has been
set to "Other" looks for a `public/` directory after the build and fails with
*No Output Directory named "public"*. Next builds to `.next`; there is no
`public/` here and adding an empty one would "fix" the error by deploying a
static shell with no app in it.

CI runs typecheck → lint → test → build → e2e on every push and PR.

---

## What is built

- **`/`** — the front.
- **`/[handle]`** — a canon, in two views. **The wall** (default) is image-led
  and quiet: YouTube's own artwork, big tiles, a lot of air, and the *why* on
  the tile rather than hidden behind a hover. **The list** is the reading view.
  Both are statically generated, server-rendered, and fully readable with
  javascript switched off — view and region are query params, so any way of
  looking at a canon is a URL you can send somebody. Sent, it unfurls as a
  card with whose canon it is and the pieces that changed them
  (`[handle]/opengraph-image.tsx`, drawn at build time with `next/og`).
- **the room** — somebody's den, opened from a canon and drawn on the GPU:
  a bookcase, shelves along the walls, a record crate on the rug, lamps, dust
  in the light, and a television that plays the canon. Five buildings to keep
  it in.

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
src/components/room/   the walkable den — world.ts is the model, scene.ts the meshes
                       and light, textures.ts the painted materials, Room.tsx the
                       camera, the hud and everything you can press
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

Not a shop — somebody's den. The canon is shelved the way a collection
actually lives: a bookcase on the back wall for the ones that changed you,
shelves along the side walls, a record crate on the rug, a set on a
sideboard, and the capsule — a strongbox with a brass plate — in the back
corner. Dust drifts through the lamplight.

The room's code is loaded only when someone presses "step into the room"
(and fetched the moment a hand hovers on the way there), so a canon page
does not make every visitor download three.js to read a list.

| | |
|---|---|
| walk | `W A S D`, the on-screen pad, or the stick on a touch screen |
| look | arrow keys; or click to capture the mouse, or drag; touch drags to look |
| take something off the shelf | `E` / `Enter`, click while the reticle is on it, or tap the label on touch |
| go somewhere | click a place in the list top right, or press its number — `1`–`4` the shelves, then the set, the capsule and the noticeboard |
| add something | look at a shelf's name board or the noticeboard and press `E` |
| watch full size | `T`, or look at the set and press `E` |
| change channel | `[` and `]` · `M` mutes |
| leave | `Esc`, or the button top-left. `Esc` unwinds one layer at a time |

**How it is put together.** It is three.js (`three@0.181`, the one
dependency the room adds), in four files:

- `world.ts` — the model, as pure functions: where every shelf, sleeve, the
  set and the capsule sit, the collision boxes, which shelf you are nearest,
  and where to stand to see any of them whole on this screen. Unit-tested
  without a browser, including against generated canons of every size from
  one piece a tier to forty — a tier bigger than its spot can hold at full
  size gets smaller cases, never a bookcase through the ceiling or into the
  set.
- `scene.ts` — turns the model into meshes and lights, and owns everything
  that moves on its own (dust, the pendants' sway, the capsule's glow, the
  set's flicker, a case easing off its shelf) behind one `tick(t, dt)`.
- `textures.ts` — wood, plaster, weave and every sleeve cover are painted at
  runtime into canvases. There are no image assets to ship.
- `Room.tsx` — the camera, the frame loop, the reticle, the HUD, the card
  and the big screen.

Things worth knowing before editing it, because each one cost a debugging
session:

1. **`world.ts` measures `+y` down; three.js measures `+y` up.** The model
   was authored for CSS transforms. Every vertical coordinate crosses into
   the scene through one `up()` in `scene.ts` — skip it and the room is built
   upside down, with the reticle aiming at a mirror of it.
2. **Light is in candela, at the room's scale.** The room is ~2000 *units*
   across and point lights fall off with the square of distance, so a lamp
   needs an intensity in the millions. An intensity of 1 renders black.
3. **The reticle is a real raycast over the ring it draws** — five rays, the
   centre and the rim — and cases on a shelf touch. A single ray threads the
   seam between two cases; a gap between cases is somewhere to stand square
   in front of a bookcase and aim at nothing.
4. **Shadows are drawn once.** Nothing that casts one ever moves, and each
   lamp's shadow is a cube map — six extra renders of the room. Hanging
   fittings sway, but only the fittings; the lights stay where their shadows
   are.
5. **Resolution follows the frame rate.** A machine that cannot hold ~30fps
   draws fewer pixels (down to 0.6×) until it can, and earns them back.

The room pauses — it is not torn down — behind the big screen, and a venue
change rebuilds it around you rather than walking you back to the door. The
materials take a second or two to paint, so a curtain with the owner's name
on it covers the build and lifts once there is something to see.

### Adding to it

There are two ways in. On the page, **+ add a link** sits above the wall. In
the room, every shelf has a name board hanging under it — *the ones that
changed me · + add something here* — and a noticeboard stands by the door;
look at either and press `E` (or tap) and the same form opens, already on
that shelf.

The form takes a link, a title, a why and a shelf, and is validated with
`newLinkSchema` in `src/lib/drafts.ts`: web links only, a why capped at the
same 200 characters the database will enforce. A YouTube link becomes a
channel on the set.

**Where it goes, honestly:** saving to a canon needs the database and
sign-in, which are the next milestones. Until then what you add is a
*draft* kept in this browser only — it shows up on the shelves in the room
and in an "on this device" list on the page, marked as a draft on its cover,
its card and the list, and it can be removed. Nobody else sees it, and
nothing claims it has been saved to the canon.

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
- **The set in the room shows the channel's artwork, not a player.** A
  playing iframe cannot be a texture on a 3D screen, and a video you cannot
  hear properly across a room is not worth pretending with. The picture
  lights the room the way a screen does; the playing happens full size.

A link with no video — a Wikipedia page, a film — gets no channel. Switched
off, the set's glass says what it is for and how many channels it has; a
canon with nothing embeddable says "no signal" and the watch controls say
why they are unavailable.

### Where you keep it

The same canon, the same shelves, the same walk — five buildings. **The den**
(floorboards, lamps), **the castle library** (oak, stone, green shade), **the
vault** (steel and concrete), **the seed bank** (cold storage cut into rock),
**the cinema** (one screen in the dark). Pick before you go in, or change
without leaving.

Each hangs the light it would actually have and stands on what it would be
built on: a shade on a cord over boards and a rug in the den, an iron hoop
of candle bulbs in the library, fluorescent tubes over bare stone in the
vault, panels set into the ceiling of the seed bank, and dim sconces on the
cinema's walls with nothing hanging in your eyeline.

A venue is a palette, a fitting, a floor and a vocabulary, not a second
implementation. The geometry in `world.ts` is shared; each venue in
`venues.ts` carries the colours the materials are painted in, how hard the
room is lit, what the light hangs from and what you walk on, and the four
weight tiers get renamed in the building's own words — *the ones that
changed me* in the den is *sealed* in the vault and *the seed stock* in the
bank. Adding one is an entry in that list.

### Watching

Walking a 3D room to squint at a screen inside it is a worse way to watch
something than just watching it. So the set in the room is the *invitation* —
`T`, or look at it and press `E` — and what you get is the video at full size
with the room stepped out of the way. The walk loop stops while you watch; the
dial and the mute stay on screen, and `Esc` puts you back where you were
standing.

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
a list` returns you to the canon, and if the browser will not draw WebGL — or
loses the context mid-visit — the room says so and offers the list.

**Motion.** The walk in through the door, the dust, the swaying pendants, the
case coming up into your hands, the big screen switching on like a tube, the
front page arriving in reading order, the wall's tiles rising as you scroll:
all of it is decoration on top of something that already works, and all of it
is off under `prefers-reduced-motion` — the room reads the same setting and
holds still.

**Keyboard.** The room portals to `<body>` and makes everything else `inert`,
so Tab cycles its own controls instead of wandering into the canon behind it;
the card and the big screen do the same to the HUD, and the big screen takes
focus when it opens. `Esc` unwinds one layer at a time —
card, then mouse capture, then the room — and leaving returns focus to whatever
opened it. Contained while you are in it, never a trap.

**Nothing in the room is set dressing.** There used to be a CD wallet and a
shoebox of sticks holding anonymous filler, plus a couch, a coffee table and a
side table holding nothing at all. They were cut: every sleeve on screen is now
a real canon entry, and the only things you can walk into are the things
holding the collection. Deleting them improved the look more than any texture
did — they were five low-quality objects competing with the four that matter.

**Light.** Two pendant lamps are real point lights with soft shadows; an
ambient term, a sky/floor bounce and a soft key over the shoulder carry the
rest, so nothing is lit from one point only. The set in the room is a light
too, once it is on.

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

**Smoothness.** Two thresholds, not one. Culling and the reticle both used a
single cutoff, so anything sitting near it flipped state every time the camera
drifted a few pixels — props blinking, the highlight ping-ponging between two
sleeves, each swap restarting a transition. Both have hysteresis now: showing
and hiding happen at different distances, and whatever you are already pointing
at keeps a wider cone. The first cull pass is deliberately strict, because
everything starts marked visible and a lenient first test leaves the wall
behind the spawn point switched on — which renders inverted across the view and
swallows every click aimed at a shelf.

**Frame rate is unverified.** This was built and driven headless, where Chromium
software-rasterises at a few fps, so no honest number is available. The
simulation costs ~0.04ms a frame; the budget is entirely paint and composite.
The M5 target of 50fps needs checking on real hardware.
