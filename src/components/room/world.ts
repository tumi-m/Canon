import type { Entry } from "@/lib/schema";

/**
 * The room, as data.
 *
 * Not a shop — somebody's den. Shelves against the walls, a record crate on the
 * floor, a CD wallet open on the coffee table, a shoebox of USB sticks, a rug,
 * lamps rather than strip lighting. The things a collection actually lives in.
 *
 * World space: +x right, -z further into the room, +y down. The camera sits at
 * y=0 (eye level); floor +290, ceiling -300. The rendered `.world` element
 * carries the inverse camera transform, so everything below is authored in
 * plain world coordinates.
 *
 * Positions are computed here and handed to the renderer, which builds meshes
 * from them. Keeping the model separate from the drawing is what let the whole
 * room move from CSS 3D to WebGL without touching a line of the layout, the
 * collision boxes, or their tests.
 */

export const G = {
  floorY: 290,
  ceilY: -300,
  roomX: 1050,
  backZ: -1560,
  frontZ: 760,
  spawnZ: 520,
  speed: 430,
  radius: 95,
} as const;

/**
 * What a shelf face is made of. Changes how a sleeve is drawn, not where.
 *
 * There were four kinds. A CD wallet and a shoebox of sticks were cut because
 * neither held a single canon entry — they were flavour, filled with anonymous
 * clutter, and they were the worst-looking objects in the room. Everything left
 * carries the product.
 */
export type Furniture = "shelf" | "crate";

/**
 * The slot each sleeve occupies, centre to centre once GAP is added.
 *
 * These are the *pitch* of the grid, not the size of the object drawn in it:
 * the renderer fills the whole slot including its gap, because cases on a
 * shelf touch. They used to float with thirty units of air around them, which
 * read as a display stand rather than a collection — and left a void wide
 * enough to stand in front of and see nothing at all.
 *
 * A unit copies these into its own `slot` — scaled down if its tier has
 * more pieces than its spot can hold at full size — and the renderer and the
 * tests read the unit's, so nobody carries a second copy of these numbers.
 */
const SLEEVE: Record<Furniture, { w: number; h: number; cols: number }> = {
  // a bookcase of standing cases: pitch 160 × 214, near enough a poster
  shelf: { w: 148, h: 214, cols: 5 },
  // a floor crate you flip through: square, the way a record sleeve is
  crate: { w: 168, h: 188, cols: 4 },
};

export const GAP = 12;
const PAD = 16;
const BORDER = 8;

export type Aim = { readonly x: number; readonly y: number; readonly z: number };

export type Sleeve = Aim & {
  readonly key: string;
  readonly entry: number;
  readonly left: number;
  readonly top: number;
};

export type Unit = {
  readonly key: string;
  readonly label: string;
  readonly furniture: Furniture;
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  /** degrees about Y; 0 faces the front of the room */
  readonly rot: number;
  /** degrees about X; crates and wallets lie back or flat */
  readonly tilt: number;
  readonly width: number;
  readonly height: number;
  readonly rows: number;
  /**
   * The pitch each sleeve on this unit actually occupies. SLEEVE's numbers,
   * unless the tier had more pieces than the spot could hold at full size,
   * in which case every case on it is smaller by the same factor.
   */
  readonly slot: { readonly w: number; readonly h: number };
  readonly sleeves: readonly Sleeve[];
};

export type Box = { x0: number; x1: number; z0: number; z1: number };

/**
 * A hanging lamp. There used to be five of these and they were translucent
 * discs floating in mid-air — CSS 3D has no lights, so a disc pretending to be
 * one reads as a smudge. Two remain, each an actual object: a shade with a hot
 * underside. The light they appear to cast is painted into the walls, floor
 * and ceiling instead, which is the only place light can honestly live here.
 */
export type Lamp = { key: string; x: number; y: number; z: number };

export type Section = { readonly name: string; readonly entries: readonly number[] };

/**
 * The television and the sideboard it stands on, against the right-hand wall.
 * It lives in the model because it is furniture you can walk into — and
 * because it once stood somewhere nobody had checked, straight through the
 * shelf beside it.
 */
export type TvSet = {
  /** centre of the sideboard's footprint */
  readonly x: number;
  readonly z: number;
  /** along the wall */
  readonly length: number;
  /** out from the wall */
  readonly depth: number;
};

/**
 * Something with a face you walk up to and look at: a shelf, the set, the
 * capsule. Enough to work out where to stand to see all of it.
 */
export type Face = Pick<Unit, "fx" | "fy" | "fz" | "rot" | "width" | "height"> & {
  readonly furniture?: Furniture;
};

/** A place in the room that is not a shelf, but that you might want to go to. */
export type Feature = Face & { readonly key: "set" | "capsule"; readonly label: string };

export type World = {
  readonly sections: readonly Section[];
  readonly units: readonly Unit[];
  readonly lamps: readonly Lamp[];
  readonly set: TvSet;
  readonly boxes: readonly Box[];
  readonly hatchZ: number;
  /** the capsule, standing on the floor against the back wall */
  readonly capsule: Feature;
  /** the set's screen, where you look when you look at it */
  readonly screen: Feature;
  readonly bounds: { xMin: number; xMax: number; zMin: number; zMax: number };
};

export function hash(input: string): number {
  let h = 2166136261;
  for (const ch of input) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Warm, faded sleeve art — a collection that has been handled, not a catalogue. */
export function artFor(input: string): string {
  const h = hash(input);
  const hue = h % 360;
  return `linear-gradient(${(h >> 4) % 180}deg, hsl(${hue} 46% 38%), hsl(${(h >> 9) % 360} 38% 20%))`;
}

/**
 * Shelves, in the order you meet them walking in. The names are domestic
 * rather than retail — this is a room, and nothing in it is for sale.
 */
export const DEFAULT_SHELF_NAMES = [
  "the ones that changed me",
  "played to death",
  "the good shelf",
  "odds and ends",
] as const;

export function sectionsFor(
  entries: readonly Entry[],
  names: readonly string[] = DEFAULT_SHELF_NAMES,
): readonly Section[] {
  const byWeight = (w: number) => entries.flatMap((e, i) => (e.weight === w ? [i] : []));
  const picks = entries.flatMap((e, i) => (e.highlighted ? [i] : []));

  const all: Section[] = [
    { name: names[0] ?? DEFAULT_SHELF_NAMES[0], entries: byWeight(3) },
    { name: names[1] ?? DEFAULT_SHELF_NAMES[1], entries: picks },
    { name: names[2] ?? DEFAULT_SHELF_NAMES[2], entries: byWeight(2) },
    { name: names[3] ?? DEFAULT_SHELF_NAMES[3], entries: byWeight(1) },
  ];
  const stocked = all.filter((s) => s.entries.length > 0);
  return stocked.length > 0
    ? stocked
    : [{ name: "the shelf", entries: entries.map((_, i) => i) }];
}

/**
 * A face of furniture holding sleeves.
 *
 * A face turned by θ about Y maps its local +x to world (cos θ, 0, −sin θ), so
 * one formula covers the back wall, both side walls and anything angled into
 * the room.
 */
function makeUnit(
  key: string,
  label: string,
  furniture: Furniture,
  entries: readonly number[],
  at: { x: number; y: number; z: number; rot: number; tilt?: number },
  /** the room this spot has: how wide the unit may grow, and how tall */
  room: { maxWidth: number; maxHeight: number },
): Unit | null {
  const count = entries.length;
  if (count === 0) return null;

  const spec = SLEEVE[furniture];
  const frame = 2 * (PAD + BORDER);

  /* How big a case can be at a given number of columns, as a fraction of
     full size: whatever the width and the height of the spot both allow. */
  const fits = (cols: number) => {
    const rows = Math.ceil(count / cols);
    const across = (room.maxWidth - frame - (cols - 1) * GAP) / (cols * spec.w);
    const down = (room.maxHeight - frame - (rows - 1) * GAP) / (rows * spec.h);
    return Math.min(1, across, down);
  };

  /* The layout it has always had — one row until it outgrows spec.cols, then
     two — as long as that fits the spot at full size. A tier bigger than that
     used to keep adding rows until the bookcase went through the floor and the
     ceiling, or keep adding columns until it ran into the set beside it. Past
     that point, take whichever column count keeps the cases largest. */
  const preferred = Math.max(1, Math.min(spec.cols, count > spec.cols ? Math.ceil(count / 2) : count));
  let cols = preferred;
  if (fits(preferred) < 1) {
    for (let c = 1; c <= count; c++) if (fits(c) > fits(cols) + 1e-9) cols = c;
  }
  const scale = fits(cols);
  const slot = { w: spec.w * scale, h: spec.h * scale };
  const rows = Math.ceil(count / cols);
  const width = cols * slot.w + (cols - 1) * GAP + frame;
  const height = rows * slot.h + (rows - 1) * GAP + frame;

  const theta = (at.rot * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const sleeves: Sleeve[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = BORDER + PAD + col * (slot.w + GAP);
    const top = BORDER + PAD + row * (slot.h + GAP);
    const lx = left + slot.w / 2 - width / 2;
    const ly = top + slot.h / 2 - height / 2;
    sleeves.push({
      key: `${key}-${i}`,
      entry: entries[i]!,
      left,
      top,
      x: at.x + lx * cos,
      y: at.y + ly,
      z: at.z - lx * sin,
    });
  }

  return {
    key,
    label,
    furniture,
    fx: at.x,
    fy: at.y,
    fz: at.z,
    rot: at.rot,
    tilt: at.tilt ?? 0,
    width,
    height,
    rows,
    slot,
    sleeves,
  };
}

export function buildWorld(
  entries: readonly Entry[],
  shelfNames?: readonly string[],
): World {
  const sections = sectionsFor(entries, shelfNames);
  const units: Unit[] = [];
  const boxes: Box[] = [];

  /**
   * Where each shelf lives. The first section gets the tall bookcase on the
   * back wall — the one you walk in facing — and the rest fill the room in the
   * order you meet them.
   */
  /* Each spot says how much room it has. The back wall stops short of the
     capsule standing in its corner; the right-hand wall stops short of the
     set; a crate is waist height at most. A bookcase's height is whatever
     the room leaves between its middle and the nearer of floor and ceiling. */
  const tall = (y: number) => 2 * Math.min(y - G.ceilY, G.floorY - y) - 8;
  const spots = [
    { furniture: "shelf" as const, x: 0, y: -50, z: G.backZ + 80, rot: 0, tilt: 0, maxWidth: 1000 },
    { furniture: "shelf" as const, x: -(G.roomX - 30), y: -50, z: -760, rot: 90, tilt: 0, maxWidth: 1000 },
    { furniture: "shelf" as const, x: G.roomX - 30, y: -50, z: -760, rot: -90, tilt: 0, maxWidth: 690 },
    { furniture: "crate" as const, x: -430, y: 150, z: -120, rot: 20, tilt: -16, maxWidth: 520 },
    { furniture: "crate" as const, x: 450, y: 150, z: -170, rot: -24, tilt: -16, maxWidth: 520 },
  ];

  sections.forEach((section, i) => {
    const spot = spots[i % spots.length]!;
    const unit = makeUnit(`s${i}`, section.name, spot.furniture, section.entries, spot, {
      maxWidth: spot.maxWidth,
      maxHeight: spot.furniture === "crate" ? 320 : tall(spot.y),
    });
    if (!unit) return;
    if (unit.furniture === "crate") {
      // a crate stands on the floor. its height is not known until its stock is
      // laid out, so it is only here that we know where its feet go.
      const seated = { ...unit, fy: G.floorY - unit.height / 2 };
      const drop = seated.fy - unit.fy;
      units.push({
        ...seated,
        sleeves: unit.sleeves.map((sleeve) => ({ ...sleeve, y: sleeve.y + drop })),
      });
      return;
    }
    units.push(unit);
  });

  // the only things you can walk into are the things holding the canon
  for (const unit of units) {
    const along = unit.width / 2;
    const theta = (unit.rot * Math.PI) / 180;
    const dx = Math.abs(Math.cos(theta)) * along + 60;
    const dz = Math.abs(Math.sin(theta)) * along + 60;
    boxes.push({
      x0: unit.fx - dx,
      x1: unit.fx + dx,
      z0: unit.fz - dz,
      z1: unit.fz + dz,
    });
  }

  const set: TvSet = { x: G.roomX - 90, z: 70, length: 820, depth: 170 };
  boxes.push({
    x0: set.x - set.depth / 2,
    x1: set.x + set.depth / 2,
    z0: set.z - set.length / 2,
    z1: set.z + set.length / 2,
  });

  /* hung high and away from where you come in: a pendant at eye level, a
     stride from the door, is a lamp in your face rather than a lit room */
  const lamps: Lamp[] = [
    { key: "pendant-a", x: -300, y: -232, z: -820 },
    { key: "pendant-b", x: 340, y: -232, z: -260 },
  ];

  return {
    sections,
    units,
    lamps,
    set,
    boxes,
    hatchZ: G.backZ + 60,
    capsule: {
      key: "capsule",
      label: "the capsule",
      fx: -690,
      // standing on the floor: +y is down, so its middle is half its height up
      fy: G.floorY - 200,
      fz: G.backZ + 150,
      rot: 18,
      width: 320,
      height: 400,
    },
    screen: {
      key: "set",
      label: "the set",
      // the screen faces into the room from the sideboard's back edge
      fx: set.x + set.depth / 2 - 85,
      fy: G.floorY - 330,
      fz: set.z,
      rot: -90,
      width: 780,
      height: 460,
    },
    bounds: {
      xMin: -G.roomX + G.radius,
      xMax: G.roomX - G.radius,
      zMin: G.backZ + 240,
      zMax: G.frontZ - G.radius,
    },
  };
}

/** Slide out of any furniture you have walked into. */
export function collide(
  x: number,
  z: number,
  boxes: readonly Box[],
  bounds: World["bounds"],
): [number, number] {
  const r = G.radius;
  let nx = Math.max(bounds.xMin, Math.min(bounds.xMax, x));
  let nz = Math.max(bounds.zMin, Math.min(bounds.zMax, z));
  for (const b of boxes) {
    if (nx > b.x0 - r && nx < b.x1 + r && nz > b.z0 - r && nz < b.z1 + r) {
      const left = nx - (b.x0 - r);
      const right = b.x1 + r - nx;
      const front = nz - (b.z0 - r);
      const back = b.z1 + r - nz;
      const least = Math.min(left, right, front, back);
      if (least === left) nx = b.x0 - r;
      else if (least === right) nx = b.x1 + r;
      else if (least === front) nz = b.z0 - r;
      else nz = b.z1 + r;
    }
  }
  return [nx, nz];
}

export type Camera = { x: number; z: number; yaw: number; pitch: number };

/** Which shelf you are standing closest to — what the room calls itself. */
export function nearestUnit(units: readonly Unit[], cam: Camera): Unit | undefined {
  let best: Unit | undefined;
  let bestDist = Infinity;
  for (const unit of units) {
    const d = Math.hypot(unit.fx - cam.x, unit.fz - cam.z);
    if (d < bestDist) {
      bestDist = d;
      best = unit;
    }
  }
  return best;
}

/** Where you are standing and which way you are looking, in degrees. */
export type Pose = { x: number; z: number; yaw: number; pitch: number };

/**
 * Where to stand to take in a whole shelf, and which way to face it.
 *
 * A face turned by θ about Y looks out along (sin θ, cos θ), so the spot is
 * straight out from its middle, as far back as it takes for the whole face
 * to fit the view — which depends on the screen's shape. A fixed distance
 * worked on a wide monitor and left a phone held upright looking at two
 * cases of a bookcase. Collision has the last word, and the facing is worked
 * out from wherever it leaves you, so the shelf is centred even if the ideal
 * spot was out of reach.
 *
 * Yaw follows the camera's convention: forward is (sin yaw, −cos yaw).
 */
export function viewpointFor(
  unit: Face,
  world: Pick<World, "boxes" | "bounds">,
  /** the view's width over its height */
  aspect = 16 / 9,
  /** the camera's vertical field of view, in degrees */
  fov = 72,
): Pose {
  const theta = (unit.rot * Math.PI) / 180;
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  // room to spare: the hud takes a strip off the top and bottom of the view
  const margin = 1.38;
  const fit = Math.max(unit.width / 2 / tanH, unit.height / 2 / tanV) * margin;
  // a crate is shallow and you look down into it; a bookcase is deep
  const back = fit + (unit.furniture === "crate" ? 40 : 75);
  const [x, z] = collide(
    unit.fx + Math.sin(theta) * back,
    unit.fz + Math.cos(theta) * back,
    world.boxes,
    world.bounds,
  );
  const dx = unit.fx - x;
  const dz = unit.fz - z;
  const yaw = (Math.atan2(dx, -dz) * 180) / Math.PI;
  // +y is down in this model, and a positive pitch looks up
  const pitch = (Math.atan2(-unit.fy, Math.hypot(dx, dz)) * 180) / Math.PI;
  return { x, z, yaw, pitch: Math.max(-42, Math.min(42, pitch)) };
}
