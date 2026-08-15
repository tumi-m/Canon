/**
 * Where you keep it.
 *
 * The same canon, the same shelves, the same walk — a different building. Each
 * venue is a palette and a vocabulary, not a second implementation: the
 * geometry in world.ts is shared, and the surfaces read their colours from CSS
 * custom properties that `[data-venue]` overrides in globals.css. Adding one is
 * a token block and four shelf names.
 *
 * They are not decoration for its own sake. A canon meant for your household
 * and a canon meant to outlast you want to *feel* different, and the four tiers
 * in the plan already say as much.
 */

export type VenueId = "den" | "library" | "vault" | "seedbank" | "cinema";

export type Venue = {
  readonly id: VenueId;
  /** what the picker calls it */
  readonly name: string;
  /** one line, in the product's voice */
  readonly blurb: string;
  /** what the four weight tiers are called in this building */
  readonly shelves: readonly [string, string, string, string];
  /** what the walkable space itself is called, for the HUD */
  readonly noun: string;
};

export const VENUES: readonly Venue[] = [
  {
    id: "den",
    name: "the den",
    blurb: "floorboards, a rug, lamps. the room you actually watched them in.",
    shelves: ["the ones that changed me", "played to death", "the good shelf", "odds and ends"],
    noun: "room",
  },
  {
    id: "library",
    name: "the castle library",
    blurb: "oak, stone and green shade. for a canon you expect to be read later.",
    shelves: ["the canon", "annotated", "the collection", "marginalia"],
    noun: "library",
  },
  {
    id: "vault",
    name: "the vault",
    blurb: "steel and concrete. nothing leaves, nothing fades, nobody wanders in.",
    shelves: ["sealed", "held", "deposited", "loose"],
    noun: "vault",
  },
  {
    id: "seedbank",
    name: "the seed bank",
    blurb: "cold storage, cut into rock. kept for whoever needs it in a hundred years.",
    shelves: ["the seed stock", "duplicated", "catalogued", "samples"],
    noun: "bank",
  },
  {
    id: "cinema",
    name: "the cinema",
    blurb: "one screen in the dark. everything else gets out of the way.",
    shelves: ["the programme", "held over", "the back catalogue", "shorts"],
    noun: "cinema",
  },
];

export const DEFAULT_VENUE: VenueId = "den";

export function venueById(id: string | undefined): Venue {
  return VENUES.find((v) => v.id === id) ?? VENUES[0]!;
}
