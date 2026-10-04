/**
 * Where you keep it.
 *
 * The same canon, the same shelves, the same walk — a different building. Each
 * venue is a palette, a light fitting and a vocabulary, not a second
 * implementation: the geometry in world.ts is shared, and scene.ts paints the
 * materials in the palette's colours and hangs the fitting it names. Adding
 * one is an entry below.
 *
 * They are not decoration for its own sake. A canon meant for your household
 * and a canon meant to outlast you want to *feel* different, and the four tiers
 * in the plan already say as much.
 */

export type VenueId = "den" | "library" | "vault" | "seedbank" | "cinema";

/**
 * The colours the 3D room is built from. CSS tokens dress the HUD; these dress
 * the scene, and they are plain strings so the texture painter can hand them
 * straight to a 2D context.
 */
export type Palette = {
  readonly floor: string;
  readonly wall: string;
  readonly ceiling: string;
  readonly timber: string;
  readonly rugA: string;
  readonly rugB: string;
  /** the colour of the light, and of the glow around a lamp */
  readonly light: string;
  /** how hard the room is lit overall, 0..1 */
  readonly ambient: number;
};

/**
 * What the light hangs from. Five buildings with one pendant lamp between
 * them were five paint jobs on the same room; the fitting is most of what
 * says which building you are standing in.
 */
export type Fixture =
  /** a shade on a cord: the den */
  | "pendant"
  /** an iron ring of candle bulbs: the library */
  | "chandelier"
  /** a fluorescent tube along the ceiling: the vault */
  | "strip"
  /** a flat panel set into the ceiling: the seed bank */
  | "panel"
  /** a dim lamp on the wall, nothing hanging in your eyeline: the cinema */
  | "sconce";

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
  readonly palette: Palette;
  readonly fixture: Fixture;
  /** a rug on the floor, or bare floor: concrete and rock take no rug */
  readonly rug: boolean;
  /** what you walk on */
  readonly floor: "boards" | "stone";
  /**
   * Lived in — a fireplace, a sofa, a window, the door you came in by — or a
   * bare building. A home is the point of the den and the library; a vault
   * with a sofa in it is not a vault.
   */
  readonly furnished: boolean;
};

export const VENUES: readonly Venue[] = [
  {
    id: "den",
    name: "the den",
    blurb: "floorboards, a rug, lamps. the room you actually watched them in.",
    shelves: ["the ones that changed me", "played to death", "the good shelf", "odds and ends"],
    noun: "room",
    palette: {
      floor: "#5c3f27", wall: "#4a3627", ceiling: "#1b1512", timber: "#402d1c",
      rugA: "#6d3326", rugB: "#7a3a2b", light: "#ffd9a0", ambient: 0.34,
    },
    fixture: "pendant",
    rug: true,
    floor: "boards",
    furnished: true,
  },
  {
    id: "library",
    name: "the castle library",
    blurb: "oak, stone and green shade. for a canon you expect to be read later.",
    shelves: ["the canon", "annotated", "the collection", "marginalia"],
    noun: "library",
    palette: {
      floor: "#3f2d1d", wall: "#5b5347", ceiling: "#181511", timber: "#2f2018",
      rugA: "#26422f", rugB: "#2d4c39", light: "#ffd79a", ambient: 0.26,
    },
    fixture: "chandelier",
    rug: true,
    floor: "boards",
    furnished: true,
  },
  {
    id: "vault",
    name: "the vault",
    blurb: "steel and concrete. nothing leaves, nothing fades, nobody wanders in.",
    shelves: ["sealed", "held", "deposited", "loose"],
    noun: "vault",
    palette: {
      floor: "#3a3e43", wall: "#4c5257", ceiling: "#181c1f", timber: "#41474d",
      rugA: "#2c3136", rugB: "#33383d", light: "#cfe4ff", ambient: 0.42,
    },
    fixture: "strip",
    rug: false,
    floor: "stone",
    furnished: false,
  },
  {
    id: "seedbank",
    name: "the seed bank",
    blurb: "cold storage, cut into rock. kept for whoever needs it in a hundred years.",
    shelves: ["the seed stock", "duplicated", "catalogued", "samples"],
    noun: "bank",
    palette: {
      floor: "#455360", wall: "#6d8492", ceiling: "#1a242b", timber: "#4d606c",
      rugA: "#35454f", rugB: "#3c4e59", light: "#e2f4ff", ambient: 0.46,
    },
    fixture: "panel",
    rug: false,
    floor: "stone",
    furnished: false,
  },
  {
    id: "cinema",
    name: "the cinema",
    blurb: "one screen in the dark. everything else gets out of the way.",
    shelves: ["the programme", "held over", "the back catalogue", "shorts"],
    noun: "cinema",
    palette: {
      floor: "#2c1518", wall: "#34191b", ceiling: "#0f0809", timber: "#2a1315",
      rugA: "#5a1720", rugB: "#661a25", light: "#ffb894", ambient: 0.18,
    },
    fixture: "sconce",
    rug: true,
    floor: "boards",
    furnished: false,
  },
];

export const DEFAULT_VENUE: VenueId = "den";

export function venueById(id: string | undefined): Venue {
  return VENUES.find((v) => v.id === id) ?? VENUES[0]!;
}
