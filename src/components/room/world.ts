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
 * Positions are computed here rather than measured off the DOM: reading
 * offsetLeft/offsetTop silently returns zero inside a display:none subtree,
 * which collapses every sleeve onto its shelf's centre.
 */

export const G = {
  floorY: 290,
  ceilY: -300,
  /** the room is generous: css has a fixed eye plane, and walls you can press
      your nose against smear across the view */
  roomX: 1050,
  backZ: -1560,
  frontZ: 760,
  spawnZ: 520,
  speed: 430,
  radius: 95,
  perspective: 700,
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

const SLEEVE: Record<Furniture, { w: number; h: number; cols: number }> = {
  // a bookcase of standing cases
  shelf: { w: 184, h: 214, cols: 5 },
  // a floor crate you flip through: wider, shorter, fewer across
  crate: { w: 208, h: 188, cols: 4 },
};

const GAP = 12;
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

export type World = {
  readonly sections: readonly Section[];
  readonly units: readonly Unit[];
  readonly lamps: readonly Lamp[];
  readonly boxes: readonly Box[];
  readonly hatchZ: number;
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
): Unit | null {
  const count = entries.length;
  if (count === 0) return null;

  const spec = SLEEVE[furniture];
  const cols = Math.min(spec.cols, Math.max(2, count > spec.cols ? Math.ceil(count / 2) : count));
  const rows = Math.ceil(count / cols);
  const width = cols * spec.w + (cols - 1) * GAP + 2 * (PAD + BORDER);
  const height = rows * spec.h + (rows - 1) * GAP + 2 * (PAD + BORDER);

  const theta = (at.rot * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const sleeves: Sleeve[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = BORDER + PAD + col * (spec.w + GAP);
    const top = BORDER + PAD + row * (spec.h + GAP);
    const lx = left + spec.w / 2 - width / 2;
    const ly = top + spec.h / 2 - height / 2;
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
  const spots = [
    { furniture: "shelf" as const, x: 0, y: -60, z: G.backZ + 80, rot: 0, tilt: 0 },
    { furniture: "shelf" as const, x: -(G.roomX - 30), y: -60, z: -760, rot: 90, tilt: 0 },
    { furniture: "shelf" as const, x: G.roomX - 30, y: -60, z: -760, rot: -90, tilt: 0 },
    { furniture: "crate" as const, x: -400, y: 96, z: -180, rot: 20, tilt: -34 },
    { furniture: "crate" as const, x: 430, y: 96, z: -220, rot: -24, tilt: -34 },
  ];

  sections.forEach((section, i) => {
    const spot = spots[i % spots.length]!;
    const unit = makeUnit(`s${i}`, section.name, spot.furniture, section.entries, spot);
    if (unit) units.push(unit);
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

  const lamps: Lamp[] = [
    { key: "pendant-a", x: -260, y: -196, z: -560 },
    { key: "pendant-b", x: 300, y: -196, z: 60 },
  ];

  return {
    sections,
    units,
    lamps,
    boxes,
    hatchZ: G.backZ + 60,
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

export function project(target: Aim, cam: Camera): { depth: number; lateral: number } {
  const yaw = (cam.yaw * Math.PI) / 180;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const dx = target.x - cam.x;
  const dz = target.z - cam.z;
  return { depth: dx * s - dz * c, lateral: dx * c + dz * s };
}

/**
 * What is under the reticle, or null when you are looking at the rug.
 *
 * `holding` is what the reticle was on last frame. Two objects at nearly the
 * same angle would otherwise trade the highlight back and forth every few
 * frames as you drift, and each swap restarts a transition — which is what
 * flickering looks like. Whatever you are already pointing at gets a wider
 * cone, so it has to be clearly lost before anything takes it.
 */
export function aimAt<T extends Aim>(
  targets: readonly T[],
  cam: Camera,
  opts: {
    lateral?: number;
    vertical?: number;
    near?: number;
    far?: number;
    holding?: T | null;
  } = {},
): T | null {
  const { lateral = 120, vertical = 160, near = 110, far = 1600, holding = null } = opts;
  const tp = Math.tan((cam.pitch * Math.PI) / 180);
  /** the cone is 45% wider for the thing already held */
  const STICK = 1.45;

  let best: T | null = null;
  let bestDepth = Infinity;
  for (const target of targets) {
    const held = holding !== null && target === holding;
    const slack = held ? STICK : 1;
    const { depth, lateral: off } = project(target, cam);
    if (depth < near || depth > far * slack) continue;
    if (Math.abs(off) > lateral * slack) continue;
    if (Math.abs(target.y - -depth * tp) > vertical * slack) continue;
    // a held target only loses to something meaningfully nearer
    const score = held ? depth * 0.7 : depth;
    if (score >= bestDepth) continue;
    bestDepth = score;
    best = target;
  }
  return best;
}

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
