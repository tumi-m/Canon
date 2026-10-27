/**
 * Where a thing can be watched, per region.
 *
 * The live source (M4) is TMDB's /watch/providers, which is powered by
 * JustWatch. Two constraints from docs/PLAN.md §6 are baked into the shape of
 * this module rather than bolted on later:
 *
 *  1. TMDB returns no deep links to Netflix/Prime/etc. The honest click target
 *     is the TMDB watch page, so an offer carries `watchUrl`, never a
 *     synthesised provider URL.
 *  2. Attribution is mandatory *per item*, not once in a footer, and both TMDB
 *     and JustWatch must be credited. `ATTRIBUTION` is exported so every
 *     surface that renders an offer renders the credit with it.
 *
 * Until the API key exists this reads from a seeded table. The shape is the
 * shape the normaliser will return, so M4 replaces the data, not the callers.
 */
import type { Region } from "./schema";

export const ATTRIBUTION = "via JustWatch / TMDB";

export type OfferKind = "free" | "sub" | "rent";

export type Provider = {
  readonly id: string;
  readonly name: string;
  readonly kind: OfferKind;
  /** the brand colour, used only as a chip background */
  readonly colour: string;
};

export const PROVIDERS = {
  youtube: { id: "youtube", name: "youtube", kind: "free", colour: "#e0342a" },
  netflix: { id: "netflix", name: "netflix", kind: "sub", colour: "#c8402a" },
  prime: { id: "prime", name: "prime video", kind: "sub", colour: "#2b7fa8" },
  disney: { id: "disney", name: "disney+", kind: "sub", colour: "#2f4a94" },
  max: { id: "max", name: "hbo max", kind: "sub", colour: "#5b3ea8" },
  apple: { id: "apple", name: "apple tv", kind: "sub", colour: "#3d3d3d" },
  showmax: { id: "showmax", name: "showmax", kind: "sub", colour: "#128a5e" },
  rent: { id: "rent", name: "rent", kind: "rent", colour: "#d99114" },
} as const satisfies Record<string, Provider>;

export type ProviderId = keyof typeof PROVIDERS;

export type Offer = {
  readonly provider: Provider;
  /** TMDB's watch page for the title. Never a synthesised provider deep link. */
  readonly watchUrl: string;
  readonly attribution: string;
};

export const REGIONS = {
  nz: "new zealand",
  za: "south africa",
  jp: "japan",
  us: "united states",
} as const satisfies Record<string, string>;

export type KnownRegion = keyof typeof REGIONS;

export function isKnownRegion(region: string): region is KnownRegion {
  return region in REGIONS;
}

export function regionName(region: Region): string {
  return isKnownRegion(region) ? REGIONS[region] : region;
}

/**
 * Seeded provider data, standing in for the TMDB response.
 * `"*"` means the same everywhere — true for anything on youtube.
 */
type RegionTable = Partial<Record<KnownRegion | "*", readonly ProviderId[]>>;

const SEED: Record<string, RegionTable> = {
  gtav: { "*": ["youtube"] },
  jobs: { "*": ["youtube"] },
  mark: { "*": ["youtube"] },
  mine: { "*": ["youtube"] },
  hl2: { "*": ["youtube"] },
  fish: { "*": ["youtube"] },
  dogs: { "*": ["youtube"] },
  case: { "*": ["youtube"] },
  star: { "*": ["youtube", "disney"] },
  port: { "*": ["youtube"] },
  comf: { "*": ["youtube"] },
  fred: { "*": ["youtube"] },
  btls: { nz: ["disney"], za: ["disney"], jp: ["disney"], us: ["disney"] },
  jiro: { nz: ["prime", "rent"], za: ["showmax", "rent"], jp: ["prime"], us: ["max", "rent"] },
  senn: { nz: ["netflix", "rent"], za: ["showmax"], jp: ["rent"], us: ["netflix", "rent"] },
  miya: { nz: ["rent"], za: ["rent"], jp: ["netflix"], us: ["max", "rent"] },
};

/** TMDB's watch page — the only link the provider data legitimately supports. */
function watchUrl(workId: string, region: Region): string {
  return `https://www.themoviedb.org/search?query=${encodeURIComponent(workId)}&region=${region}`;
}

/**
 * Offers for a work in a region. An empty array is a first-class state — "not
 * streaming here" is information, not a failure.
 */
export function offersFor(workId: string, region: Region): readonly Offer[] {
  const table = SEED[workId];
  if (!table) return [];
  const ids = table["*"] ?? (isKnownRegion(region) ? table[region] : undefined) ?? [];
  return ids.map((id) => ({
    provider: PROVIDERS[id],
    watchUrl: watchUrl(workId, region),
    attribution: ATTRIBUTION,
  }));
}

/** Does this work land on any of the services the visitor actually pays for? */
export function onYourServices(
  workId: string,
  region: Region,
  services: ReadonlySet<string>,
): boolean {
  return offersFor(workId, region).some(
    (offer) => offer.provider.kind === "free" || services.has(offer.provider.id),
  );
}
