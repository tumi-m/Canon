# canon.

**the content that made you.**

One page per person listing the content that shaped them — each item a link, a
one-line *why*, a weight, and where it is actually streamable in that visitor's
region. Not a feed. A profile.

The one-sentence pitch: *Letterboxd for everything, Linktree for taste.*

---

## What is in this repository right now

This is the pre-code stage: the spec, the plan, and a working prototype of the
hard part. There is no Next.js app yet — milestone **M0** in `docs/PLAN.md` is
what starts it.

| Path | What it is |
|---|---|
| `prototype/canon.html` | The whole product as a single self-contained HTML file. No build, no dependencies — open it in a browser. |
| `docs/PLAN.md` | The build spec: stack, schema, RLS policies, milestones M0–M9, risk register. |
| `docs/BUSINESS.md` | The business case: market, moat, revenue, bottom-up projections with the bear case first. |

Open the prototype:

```bash
open prototype/canon.html     # macOS
xdg-open prototype/canon.html # linux
```

---

## The prototype

Five ways to look at the same canon, switchable from the control deck:

- **text** — the farza-style list, with the red *changed me* tier
- **vhs shelf** — tape spines on a rack
- **3d shelf** — books on a plank
- **crt room** — channel-surf the embeddable items on a simulated TV
- **the store** — walk into it

Plus the availability layer (per-region streaming, JustWatch-shaped), the four
storage tiers, membership and the back room, the regional archive, and the
generative-UI vibe box.

Everything persists to `localStorage`. There is no backend.

### The store

`▶ walk into the store` on the hero, or `▸ the store` in the view switcher.

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

**How it is put together.** The world is authored in plain world coordinates
(`+x` right, `-z` deeper into the shop, `+y` down, eye at `y=0`) and the
`.world` element carries the inverse camera transform. Everything else follows
from that.

Three things are worth knowing before editing it, because each one cost a
debugging session:

1. **CSS 3D has no depth buffer.** Siblings are painted in sorted order and ties
   fall back to DOM order. Aisle signs share a `z` with the shelving they hang
   over, so they are emitted in a later pass.
2. **The eye plane is fixed at the `perspective` distance.** Anything that
   straddles it magnifies toward infinity and smears across the view. That is
   what `cull()` is for, and it is why the floor light-pool planes were cut.
3. **The world is measured after it is displayed.** Each case's world position
   comes from its `offsetLeft`/`offsetTop`, and a `display:none` subtree
   measures as zero — which silently collapses every case onto its shelf's
   centre and leaves the reticle with nothing to hit.

**Getting out.** The store is an enhancement, never a requirement: `☰ list
instead` drops you back to the plain text view with the same canon,
`prefers-reduced-motion` disables head bob and drift, and no keyboard focus is
ever trapped.

**Set dressing.** The unlabelled cases filling the wall bays and the backs of
the islands are the shop's background stock. They are deliberately anonymous
and non-interactive — they are scenery, never canon entries.

---

## Design

Analog futurism: warm paper × phosphor. Newsreader for voice, IBM Plex Mono for
machine text, film grain over everything. Lowercase, warm, plain copy — "the
content that made you", not "curate your media journey".

No purple gradients, no glassmorphism, no rounded-2xl-shadow-lg cards. The test
in `docs/PLAN.md` §12: if a screenshot could belong to any other SaaS product,
it is wrong.

Design tokens are CSS custom properties (`--paper`, `--ink`, `--red`, `--phos`),
which is what makes the night-CRT mode and the generative-UI themes a token swap
rather than a rewrite.

---

## Next

`docs/PLAN.md` §8, milestone M0. One milestone per session, one PR each.
