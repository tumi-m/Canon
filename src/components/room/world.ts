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

/** What a shelf face is made of. Changes how a sleeve is drawn, not where. */
export type Furniture = "shelf" | "crate" | "wallet" | "box";

const SLEEVE: Record<Furniture, { w: number; h: number; cols: number }> = {
  // a bookcase of standing cases
  shelf: { w: 168, h: 196, cols: 5 },
  // a floor crate you flip through: wider, shorter, fewer across
  crate: { w: 196, h: 176, cols: 4 },
  // the cd wallet, open on the table — two pages of sleeves
  wallet: { w: 150, h: 150, cols: 4 },
  // a shoebox of usb sticks and loose discs
  box: { w: 120, h: 120, cols: 4 },
};

const GAP = 12;
const PAD = 16;
const BORDER = 8;

export type Aim = { readonly x: number; readonly y: number; readonly z: number };

export type Sleeve = Aim & {
  readonly key: string;
  /** index into the canon, or null when this is the household's own clutter */
  readonly entry: number | null;
  readonly left: number;
  readonly top: number;
  readonly seed: number;
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
  readonly filler: boolean;
  readonly sleeves: readonly Sleeve[];
};

export type Box = { x0: number; x1: number; z0: number; z1: number };

export type Lamp = { key: string; x: number; y: number; z: number; warm: boolean };

export type Section = { readonly name: string; readonly entries: readonly number[] };

export type World = {
  readonly sections: readonly Section[];
  readonly units: readonly Unit[];
  readonly lamps: readonly Lamp[];
  readonly motes: readonly number[];
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
export function sectionsFor(entries: readonly Entry[]): readonly Section[] {
  const byWeight = (w: number) => entries.flatMap((e, i) => (e.weight === w ? [i] : []));
  const picks = entries.flatMap((e, i) => (e.highlighted ? [i] : []));

  const all: Section[] = [
    { name: "the ones that changed me", entries: byWeight(3) },
    { name: "played to death", entries: picks },
    { name: "the good shelf", entries: byWeight(2) },
    { name: "odds and ends", entries: byWeight(1) },
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
  filler: number,
  at: { x: number; y: number; z: number; rot: number; tilt?: number },
): Unit | null {
  const count = entries.length + filler;
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
      entry: i < entries.length ? entries[i]! : null,
      left,
      top,
      seed: hash(`${key}:${i}`),
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
    filler: filler > 0,
    sleeves,
  };
}

export function buildWorld(entries: readonly Entry[]): World {
  const sections = sectionsFor(entries);
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
    const unit = makeUnit(`s${i}`, section.name, spot.furniture, section.entries, 0, spot);
    if (unit) units.push(unit);
  });

  // the cd wallet, lying open on the coffee table
  const wallet = makeUnit("wallet", "the cd wallet", "wallet", [], 8, {
    x: 0,
    y: 168,
    z: 20,
    rot: 0,
    tilt: -76,
  });
  if (wallet) units.push(wallet);

  // a shoebox of usb sticks and burned discs, under the side table
  const shoebox = makeUnit("shoebox", "a shoebox of sticks", "box", [], 6, {
    x: -700,
    y: 208,
    z: 300,
    rot: 34,
    tilt: -62,
  });
  if (shoebox) units.push(shoebox);

  // furniture you cannot walk through
  boxes.push({ x0: -280, x1: 280, z0: -160, z1: 180 }); // coffee table
  boxes.push({ x0: -900, x1: -520, z0: 160, z1: 440 }); // side table
  boxes.push({ x0: 700, x1: 1050, z0: -520, z1: -60 }); // the tv stand
  boxes.push({ x0: -1050, x1: -560, z0: -760, z1: -340 }); // the couch
  for (const unit of units) {
    if (unit.furniture === "wallet" || unit.furniture === "box") continue;
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
    { key: "pendant-a", x: -220, y: -200, z: -520, warm: true },
    { key: "pendant-b", x: 300, y: -200, z: 140, warm: true },
    { key: "floor", x: -820, y: -40, z: -480, warm: true },
    { key: "back", x: 0, y: -120, z: G.backZ + 200, warm: true },
    { key: "tv", x: 880, y: 40, z: -280, warm: false },
  ];

  const motes: number[] = [];
  for (let z = 700; z > G.backZ + 200; z -= 520) motes.push(z);

  return {
    sections,
    units,
    lamps,
    motes,
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

/** What is under the reticle, or null when you are looking at the rug. */
export function aimAt<T extends Aim>(
  targets: readonly T[],
  cam: Camera,
  opts: { lateral?: number; vertical?: number; near?: number; far?: number } = {},
): T | null {
  const { lateral = 120, vertical = 160, near = 110, far = 1600 } = opts;
  const tp = Math.tan((cam.pitch * Math.PI) / 180);
  let best: T | null = null;
  let bestDepth = Infinity;
  for (const target of targets) {
    const { depth, lateral: off } = project(target, cam);
    if (depth < near || depth > far || depth >= bestDepth) continue;
    if (Math.abs(off) > lateral) continue;
    if (Math.abs(target.y - -depth * tp) > vertical) continue;
    bestDepth = depth;
    best = target;
  }
  return best;
}

/** Which shelf you are standing closest to — what the room calls itself. */
export function nearestUnit(units: readonly Unit[], cam: Camera): Unit | undefined {
  let best: Unit | undefined;
  let bestDist = Infinity;
  for (const unit of units) {
    if (unit.filler) continue;
    const d = Math.hypot(unit.fx - cam.x, unit.fz - cam.z);
    if (d < bestDist) {
      bestDist = d;
      best = unit;
    }
  }
  return best;
}
