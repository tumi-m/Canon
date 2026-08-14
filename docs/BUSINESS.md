# CANON — The Personal Curated Content Network
### Business plan & MVP spec · Working name: **Canon** (as in "your personal canon")
*Prepared for T · July 2026*

---

## 1. The Idea, Sharpened

farza.com/content is the prototype. He writes: *"i've seen a lot of lists where people list the books they read... but never seen anyone do the same for content."* His list isn't "favorites" — it's **"content where after i watched them, i was better."** That framing is the product.

**Canon is a profile, not a feed.** One page per person that answers: *what content made you who you are?* Links to anything — YouTube, Netflix, X, podcasts, films, essays — with a one-line note on why it mattered. Under 5 minutes to build. Beautiful enough to put in your bio.

The one-sentence pitch: **"Letterboxd for everything, Linktree for taste."**

### Why the timing is right
- Letterboxd hit ~30M members (up from 1.5M in 2019) with almost no paid acquisition — proof that logging + identity + taste is a durable loop, but only for *film*.
- TechCrunch's June 2026 "next generation of social apps" roundup is full of single-vertical taste apps: Beli (food), Airbuds (music), Corner (places), Fable (books), Shelf (cross-media tracking). The market has validated the category and fragmented it by vertical. **Nobody owns the cross-media, link-native, public-profile position.**
- Algorithm fatigue is now a mainstream sentiment. PI.FYI's whole brand is "friends over algorithms." People increasingly want *chosen* recommendations from *specific humans*.

### What Canon is NOT (scope discipline)
- Not a hosting platform — links only. Zero content storage, zero rights liability for paywalled content.
- Not a feed you scroll for hours. Sessions are short and intentional: visit a person, leave with something to watch.
- Not a tracker/diary first (that's Shelf/Trakt). Public identity first, tracking later.

---

## 2. Product

### 2.1 Core object: the Canon Card
Every item on a profile is a card:
- **Link** (YouTube, IMDb, Netflix, X, Spotify, article, anything)
- **Auto-fetched metadata** — title, thumbnail, runtime, source (via oEmbed/OpenGraph, zero typing)
- **The "why"** — one line, max ~200 chars. This is the moat-in-miniature: the annotation is the value, not the link.
- **Weight** — farza marks red the pieces that "deeply affected" him. Canon has tiers: *changed me* / *great* / *solid*. No 5-star ratings; ratings are for critics, weights are for identity.

### 2.2 The profile
- `canon.so/tumelo` — clean, fast, shareable. Sections by category or by life-chapter ("what I watched at 21").
- **Generative UI**: instead of one fixed layout, an LLM arranges your profile from your items + whys — a film-heavy canon gets a poster wall, a talk-heavy one gets a lecture-hall list, a music canon gets liner notes. Every canon looks like its owner. This is the "generative UI" angle done in a way no incumbent does.
- Private-by-default items allowed; profile itself is public — it's meant to be your taste résumé.

### 2.3 The Room (the myretrotvs insight, generalized)
For content that is *publicly embeddable* (YouTube, X video, Vimeo — never paywalled Netflix content), you can **watch someone's canon inside a themed room**: a 90s CRT den, a minimalist cinema, an anime bedroom, a cyberpunk arcade — plus generative rooms built from the vibe of the list itself. Channel-surf a person: press next, get the next thing that shaped them.
- This turns a list into an *experience* and a shareable artifact ("watch my canon").
- MyRetroTVs proved people love simulated channel-surfing of YouTube content; Canon makes it personal instead of generic-decade.
- Legally clean: standard embeds, views count for the creator, no scraping or rehosting.

### 2.4 Ingestion (the <5 minute promise)
1. **Paste links** — metadata auto-fills. 10 items in 3 minutes.
2. **Import** — Letterboxd CSV export, YouTube liked/playlists (official API + OAuth), Spotify (official API), X bookmarks, browser bookmarks file, Goodreads export.
3. **Voice/photo dump** — talk for 60 seconds about content you love or screenshot your watch-history; AI parses into draft cards you approve. (This is the intuitive "2-minute setup" wedge.)
4. **Browser extension** (post-MVP) — one-click "add to canon" from any page. This, not scraping, is the honest version of "automatically list what they watch." *Avoid scraping Netflix/streaming accounts: it breaks ToS, breaks constantly, and creates creepy default-share risk. Deliberate curation is the product; passive logging is a later, opt-in layer.*

### 2.5 Social layer (v2, after profiles work standalone)
- Follow people, not topics. A reverse-chron "new from people you follow" page — no algorithmic feed.
- **Overlap** — visit someone's canon, see "you share 6 items" + "here's what they have that you don't." This is the discovery engine and it requires zero ML at first.
- Asks: "what should I watch that changed you?" (PI.FYI-style prompts.)

### 2.6 Matching & dating (v3, as an API — not an app)
Shared canon overlap is a strong compatibility signal ("we both have *The Beatles: Get Back* and *Jiro Dreams of Sushi* in 'changed me'"). Build **Canon Match** as a feature (browse high-overlap people) and offer the **taste-graph as an API** to dating apps rather than building dating yourself — you become infrastructure ("Spotify Wrapped for compatibility") instead of competing with Hinge.

### 2.7 On NFTs / digital ID
Skip NFTs — in 2026 they add friction and signal the wrong brand. The underlying wants are real, though, and achievable without a chain: **portable taste identity** (export your canon as JSON/ActivityPub; your canon is yours), **provenance** ("first 100 people to canon this video" — timestamped, verifiable), and **verified profiles** for prominent people. Revisit crypto only if a real interoperability partner shows up.

---

## 3. Competitive Landscape

| Player | What it is | Why Canon is different |
|---|---|---|
| **Letterboxd** (~30M members) | Film diary + reviews | Single-vertical; diary-first. Canon is cross-media and identity-first. Also: import from it, don't fight it. |
| **Shelf** | Private cross-media tracker (music/film/TV/books) | Closest competitor. But private-by-default, app-only, tracking-first. Canon is the *public, link-native, web-first* inverse. |
| **PI.FYI** | Recommendation feed, anti-algorithm | Feed-first, editorially flavored. Canon is profile-first; the unit is a person, not a post. |
| **Likewise / Trakt** | Recommendation engine / TV tracking utility | Utility, not identity. No one shares their Trakt in a bio. |
| **Beli, Corner, Airbuds, Fable** | Vertical taste apps (food, places, music, books) | Prove demand per vertical; none aggregate. Canon is the horizontal profile layer above them. |
| **Linktree** ($64M rev FY24) | Link-in-bio for *your own* stuff | Same distribution motion (bio link, web-first, freemium SaaS) but for content you *love*, not content you *made*. Linktree is the business-model comparable, not a competitor. |
| **MyRetroTVs / my90stv** | Decade-themed YouTube channel-surfing | Experience inspiration; generic content, no identity, no accounts. Canon Rooms = this, personalized. |
| **Pinterest / Cosmos / Are.na** | Visual inspiration boards | Images and aesthetics, not watchable content with a "why." |
| **TikTok / IG / X** | Algorithmic feeds | The thing people are tired of. Canon doesn't compete for hours; it competes for *meaning*. Dropbox/Drive aren't competitors at all — nobody shares taste via file storage. |

**The gap:** every player is either single-vertical (Letterboxd, Beli), private/tracking-first (Shelf, Trakt), or feed-first (PI.FYI, TikTok). Public + cross-media + link-native + person-as-unit is open.

---

## 4. Moat & Flywheel

### Moat (built in this order)
1. **Annotation corpus** — millions of "why this mattered to me" statements attached to content. Nobody else collects this. It's the training data for the best taste-matching model on earth, and it can't be scraped into existence.
2. **The taste graph** — person↔content↔weight↔why edges. Overlap, matching, and recommendations all derive from it. Network-effect data moat: each new canon makes every overlap computation better.
3. **Identity lock-in** — once your canon is in your bio and has followers, switching costs are social, not technical (same lock-in that keeps people on Letterboxd/Linktree).
4. **Brand** — "canon" as a verb ("that's canon for me"). Vertical apps can't credibly claim the whole of a person's taste; a horizontal brand can.

What is *not* a moat: features (Rooms, generative UI will be copied), embeds, AI ingestion. Speed + corpus + brand are the defensible trio.

### Flywheel
```
Someone shares their canon link (bio, group chat, dating profile)
   → visitor browses, watches something in a Room
   → "make your own" is one import away (<5 min)
   → new canon = new shareable artifact + more overlap data
   → overlap makes discovery/matching better
   → better discovery = more reasons to return & share
   → (loop)
```
Accelerants: (a) **Wrapped-style "Canon Recap"** — annual shareable card, proven viral mechanic; (b) **celebrity canons** — one farza-tier person sharing their canon = thousands of profile creations (this is literally how the idea started); (c) Rooms as TikTok-able screen recordings.

---

## 5. Go-to-Market: How It Carves a Path Past TikTok/IG/X

Don't fight for attention time — **fight for identity space.** TikTok owns "kill time," IG owns "look at my life," X owns "my opinions." Nobody owns **"this is my taste, canonically."** The bio-link slot and the "what should I watch?" text are the beachheads.

1. **Seed with 100 tastemakers** (podcasters, indie devs, writers, YouTubers — farza-adjacent internet). Hand-build their canons for them. Their audiences are the first wave. (Letterboxd grew exactly this way: community texting links, no paid push.)
2. **Own the "send me recs" moment.** When anyone asks "what should I watch?" the answer becomes a canon link.
3. **Wrapped moment in December.** Canon Recap cards on IG stories/X.
4. **Dating-profile hack**: "canon.so/name" in Hinge bios is free, on-brand distribution.

---

## 6. MVP (6 weeks, 1–2 people, leveraging existing services)

**Scope: profile + cards + import + share. Nothing else.** No feed, no follows, no Rooms, no matching.

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js on **Vercel** | You literally said "Vercel of content sharing" — build it on the thing |
| DB/Auth | **Supabase** (Postgres + auth + storage) | Free tier covers first 10K users |
| Metadata | **oEmbed + OpenGraph scrape**, TMDB API (film/TV), YouTube Data API, Spotify API | All free tiers |
| AI ingestion | Claude/GPT API: parse pasted text/voice transcript → draft cards | Cheap; ~$0.001/profile |
| Voice notes | Whisper API | The "talk your canon" onboarding |
| Payments | Stripe | Later, for Pro |
| Analytics | PostHog | Free tier |

**Build order:** Week 1–2: auth, card CRUD, metadata autofill, public profile page. Week 3: Letterboxd/YouTube import + AI paste-parser. Week 4: profile theming (3 hand-made layouts; generative UI later), OG share cards. Week 5: polish, waitlist, seed 20 tastemaker canons by hand. Week 6: launch — X thread + Product Hunt + farza-style "content i like" communities.

**Success gate (decide before building):** 40%+ of visitors who click "make your own" finish a ≥5-item canon, and ≥20% of creators share their link within a week. If sharing doesn't happen organically, the identity thesis is wrong — stop or pivot to the tracker/utility angle before building social.

Post-MVP: Rooms (embed player + themed frames — 2 weeks), follows + overlap (2 weeks), browser extension, generative UI layouts, Canon Match API.

---

## 7. Revenue

**Principle: charge for identity and tools, never for access to the graph.** Comparables: Linktree ($64M revenue FY24, freemium SaaS, ~$8–35/mo tiers) and Letterboxd (Pro/Patron cosmetic + stats upsell). Both prove people pay to *decorate and deepen their public identity*.

1. **Canon Pro (~$5/mo or $40/yr)** — generative UI themes, custom Rooms, advanced stats ("your taste, analyzed"), video intro on profile, priority imports. The Letterboxd Patron playbook: cosmetics + self-knowledge.
2. **Creator/Celebrity tier (~$15–25/mo)** — your "membership" idea, refined: verified profile, *subscriber-only sections* of their canon (fans pay the creator, Canon takes 10–15%), audience analytics, early drops ("Kara watched this before she tweeted it"). This is Patreon-for-taste with near-zero content cost for the creator — curation is the product.
3. **Taste-graph API (year 2+)** — dating apps, streamers, recommendation engines pay for overlap/compatibility scores. Privacy-gated, opt-in, aggregated.
4. **Tasteful commerce (year 2+)** — affiliate on outbound clicks (Amazon books, iTunes rentals, event tickets). Never sponsored placements *inside* canons — one paid item destroys the trust the whole product rests on.
5. **Not doing:** ads, selling data, NFTs.

---

## 8. Projections — Bottom-Up, With the Fiction Removed

*"More fiction is written in Excel than in Word."* So: every number below is derived from a comparable, the sensitivity is shown, and the bear case is the planning case.

**Anchors (real):**
- Letterboxd: ~1.5M members 2019 → 17M end-2024 → ~30M mid-2026. But it took **8 years** (2011–2019) to reach 1.5M. Plan for the slow decade, hope for the COVID-curve.
- Linktree: $64M revenue FY24 on tens of millions of users → implies **~$1–2 ARPU/year** blended on freemium link products. Assume Canon converts similarly or slightly better (identity products convert 1–5% to paid).
- Letterboxd-style paid conversion: industry freemium norm 2–5%.

**Assumptions (the only three numbers that matter):**
- K-factor of sharing: each active canon brings **0.3–0.7** new creators (bear–bull)
- Free→Pro conversion: **2%** (bear) / **4%** (base) / **6%** (bull, requires great Pro)
- Pro ARPU: **$40/yr**; creator-tier take-rate revenue ignored until it's real

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| **Bear** — no viral moment, pure grind | 15K canons | 60K | 200K |
| revenue (2% × $40) | ~$12K | ~$48K | ~$160K |
| **Base** — one Wrapped moment lands, 3–5 tastemakers hit | 50K | 300K | 1.2M |
| revenue (3–4% × $40 + early creator take) | ~$60K | ~$400K | ~$1.8M |
| **Bull** — Letterboxd-2020-style inflection | 200K | 1.5M | 6M |
| revenue | ~$280K | ~$2.2M | ~$9M+ |

**Read the bear case first.** Y1 bear revenue is ~$12K — i.e., **this is not a business in year 1 under any scenario; it's a bet on the graph.** Costs stay tiny (link-only = no storage/moderation burden of a media platform; two people + free tiers ≈ <$3K/mo), so the bear case is survivable indefinitely by a small team — that's the real reason the link-only architecture matters. The venture case only exists if the sharing loop (K ≥ 0.5) shows up in cohort data by month 6; measure that, not signups.

---

## 9. Risks, Honestly

1. **Shelf or Letterboxd goes horizontal + public first.** Most likely kill-shot. Mitigation: speed, web-first (they're app-first), and the annotation/"why" framing they don't have.
2. **Cold-canon problem** — empty profiles are embarrassing. Mitigation: imports + AI dump make a respectable canon in minutes; never show item counts publicly.
3. **It's a feature, not a company** — Linktree could add "content I like" tomorrow. Mitigation: Linktree serves creators' *output*; taste identity needs its own brand. Still — move fast.
4. **Embed fragility** — YouTube/X can change embed rules. Mitigation: links always work even if embeds die; Rooms degrade gracefully to link lists.
5. **Curation fatigue** — people build once and never return. Mitigation: this is fine for the identity product (Linktree profiles are also mostly static and it made $64M); social layer + Recap create the return loop.

---

## 10. First 3 Moves (this month)

1. Buy the domain, build your own canon by hand as spec (farza's page is the wireframe — steal the "changed me" red-tier idea).
2. Ship the 6-week MVP; hand-build 20 tastemaker canons before launch.
3. Instrument the two gate metrics (creation completion, share rate) from day one — they decide whether the social layer gets built.

---

## Sources
- [farza.com](https://farza.com) · [farza.com/content](https://farza.com/content)
- [Letterboxd — Wikipedia](https://en.wikipedia.org/wiki/Letterboxd) · [Letterboxd Statistics 2026](https://expandedramblings.com/index.php/letterboxd-statistics-facts/) · [TIME100 Companies 2026: Letterboxd](https://time.com/collection/time100-most-influential-companies/2026/letterboxd/) · [Letterboxd Pro/Patron](https://letterboxd.com/about/pro/)
- [TechCrunch — Beyond Instagram: the next generation of social apps (June 2026)](https://techcrunch.com/2026/06/06/beyond-instagram-introducing-the-next-generation-of-social-apps/) (Shelf, Corner, Airbuds, Fable, Cosmos, Retro)
- [Perfectly Imperfect / PI.FYI — Wikipedia](https://en.wikipedia.org/wiki/Perfectly_Imperfect_(platform)) · [pi.fyi](https://www.pi.fyi/)
- [Linktree revenue & model — Sacra](https://sacra.com/c/linktree/) · [Linktree pricing](https://linktr.ee/s/pricing)
- [MyRetroTVs](https://www.myretrotvs.com/) · [My90sTV](https://90s.myretrotvs.com/)
