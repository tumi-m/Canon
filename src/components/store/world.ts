import type { Entry } from "@/lib/schema";

/**
 * The shop, as data.
 *
 * World space: +x right, -z deeper into the shop, +y down. The camera sits at
 * y=0 (eye level); floor +290, ceiling -330. The rendered `.world` element
 * carries the inverse camera transform, so everything below is authored in
 * plain world coordinates.
 *
 * Case positions are computed here rather than measured off the DOM. The
 * prototype read offsetLeft/offsetTop, which silently returns zero inside a
 * display:none subtree and collapses every case onto its shelf's centre — so
 * the layout is arithmetic now, and the rendered markup is positioned from the
 * same numbers it reports.
 */

export const G = {
  floorY: 290,
  ceilY: -330,
  wallX: 1200,
  /** centre line of the free-standing island units, either side of the aisle */
  gondCx: 640,
  gondHalf: 110,
  gondLen: 1240,
  spacing: 1450,
  z0: -900,
  spawnZ: 640,
  speed: 520,
  radius: 95,
  /** css perspective; anything straddling this distance behind you smears */
  perspective: 700,
} as const;

const CASE_W = 176;
const CASE_H = 200;
const GAP = 10;
const PAD = 15;
const BORDER = 7;

export type Aim = { readonly x: number; readonly y: number; readonly z: number };

export type ShelfCase = Aim & {
  readonly key: string;
  /** index into the canon, or null when this is the shop's own background stock */
  readonly entry: number | null;
  readonly left: number;
  readonly top: number;
  readonly seed: number;
};

export type Bay = {
  readonly key: string;
  readonly fx: number;
  readonly fz: number;
  readonly rot: 90 | -90;
  readonly width: number;
  readonly height: number;
  readonly wall: boolean;
  readonly rows: number;
  readonly cases: readonly ShelfCase[];
};

export type Box = { x0: number; x1: number; z0: number; z1: number };

export type Section = { readonly name: string; readonly entries: readonly number[] };

export type World = {
  readonly sections: readonly Section[];
  readonly bays: readonly Bay[];
  readonly signs: readonly { key: string; name: string; z: number; flip: boolean }[];
  readonly tubes: readonly number[];
  readonly fogs: readonly number[];
  readonly boxes: readonly Box[];
  readonly doorZ: number;
  readonly endZ: number;
  readonly marqueeZ: number;
  readonly bounds: { zMin: number; zMax: number };
  readonly aisleZ: readonly number[];
};

/** Deterministic hash — stands in for artwork until works carry real images. */
export function hash(input: string): number {
  let h = 2166136261;
  for (const ch of input) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function artFor(input: string): string {
  const h = hash(input);
  return `linear-gradient(${(h >> 4) % 180}deg, hsl(${h % 360} 62% 34%), hsl(${(h >> 9) % 360} 55% 18%))`;
}

/** Aisles, in the order you walk past them. */
export function sectionsFor(entries: readonly Entry[]): readonly Section[] {
  const byWeight = (w: number) =>
    entries.flatMap((entry, i) => (entry.weight === w ? [i] : []));
  const picks = entries.flatMap((entry, i) => (entry.highlighted ? [i] : []));

  const all: Section[] = [
    { name: "CHANGED ME", entries: byWeight(3) },
    { name: "STAFF PICKS", entries: picks },
    { name: "THE GREATS", entries: byWeight(2) },
    { name: "DEEP CUTS", entries: byWeight(1) },
  ];
  const stocked = all.filter((section) => section.entries.length > 0);
  return stocked.length > 0
    ? stocked
    : [{ name: "THE SHELF", entries: entries.map((_, i) => i) }];
}

function bayGrid(count: number): { cols: number; rows: number } {
  const cols = Math.min(6, Math.max(2, count > 6 ? Math.ceil(count / 2) : count));
  return { cols, rows: Math.ceil(count / cols) };
}

/**
 * One shelf face. `entries` are canon items; `stock` pads the face with the
 * shop's own anonymous inventory so a small section does not look looted.
 */
function makeBay(
  key: string,
  entries: readonly number[],
  stock: number,
  fx: number,
  fz: number,
  rot: 90 | -90,
  wall: boolean,
): Bay | null {
  const count = entries.length + stock;
  if (count === 0) return null;

  const { cols, rows } = bayGrid(count);
  const width = cols * CASE_W + (cols - 1) * GAP + 2 * (PAD + BORDER);
  const height = rows * CASE_H + (rows - 1) * GAP + 2 * (PAD + BORDER);

  const cases: ShelfCase[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = BORDER + PAD + col * (CASE_W + GAP);
    const top = BORDER + PAD + row * (CASE_H + GAP);
    // centre of the case, relative to the centre of the bay
    const lx = left + CASE_W / 2 - width / 2;
    const ly = top + CASE_H / 2 - height / 2;
    cases.push({
      key: `${key}-${i}`,
      entry: i < entries.length ? entries[i]! : null,
      left,
      top,
      seed: hash(`${key}:${i}`),
      x: fx,
      y: ly,
      // local +x maps to world -z on a face turned +90°, and +z on one turned -90°
      z: rot === 90 ? fz - lx : fz + lx,
    });
  }
  return { key, fx, fz, rot, width, height, wall, rows, cases };
}

export function buildWorld(entries: readonly Entry[]): World {
  const sections = sectionsFor(entries);
  const inner = G.gondCx - G.gondHalf;
  const outer = G.gondCx + G.gondHalf;

  const endZ = G.z0 - sections.length * G.spacing - 1000;
  const doorZ = endZ + 320;
  const marqueeZ = 2200;

  const bays: Bay[] = [];
  const boxes: Box[] = [];
  const signs: { key: string; name: string; z: number; flip: boolean }[] = [];
  const aisleZ: number[] = [];

  sections.forEach((section, i) => {
    const z = G.z0 - i * G.spacing;
    aisleZ.push(z);
    // the sign hangs slightly proud of the racks it labels: css 3d has no depth
    // buffer, and a shared z makes paint order a coin toss
    signs.push({ key: `sign-${i}`, name: section.name, z: z + 40, flip: false });

    for (const side of [-1, 1] as const) {
      boxes.push({
        x0: side * G.gondCx - G.gondHalf,
        x1: side * G.gondCx + G.gondHalf,
        z0: z - G.gondLen / 2,
        z1: z + G.gondLen / 2,
      });
    }

    // the canon goes on the island faces you walk past
    const half = Math.ceil(section.entries.length / 2);
    const left = section.entries.slice(0, half);
    const right = section.entries.slice(half);
    const made = [
      makeBay(`a${i}-l`, left, 0, -inner, z, 90, false),
      makeBay(`a${i}-r`, right, 0, inner, z, -90, false),
      // the backs of the islands and the walls carry the shop's own stock,
      // so the side aisles are shelves rather than voids
      makeBay(`a${i}-lb`, [], 8, -outer, z, -90, true),
      makeBay(`a${i}-rb`, [], 8, outer, z, 90, true),
      makeBay(`a${i}-lw`, [], 8, -(G.wallX - 10), z, 90, true),
      makeBay(`a${i}-rw`, [], 8, G.wallX - 10, z, -90, true),
    ];
    for (const bay of made) if (bay) bays.push(bay);
  });

  signs.push({ key: "sign-new", name: "NEW RELEASES", z: 1600, flip: true });
  boxes.push({ x0: 640, x1: 1060, z0: 180, z1: 500 }); // the counter

  const tubes: number[] = [];
  for (let z = 1880; z > endZ; z -= 680) tubes.push(z);
  const fogs: number[] = [];
  for (let z = 300; z > endZ; z -= 520) fogs.push(z);

  return {
    sections,
    bays,
    signs,
    tubes,
    fogs,
    boxes,
    doorZ,
    endZ,
    marqueeZ,
    bounds: { zMin: doorZ + 260, zMax: 1240 },
    aisleZ,
  };
}

/** Slide out of any shelf unit you have walked into. */
export function collide(
  x: number,
  z: number,
  boxes: readonly Box[],
  bounds: { zMin: number; zMax: number },
): [number, number] {
  const r = G.radius;
  let nx = Math.max(-G.wallX + r, Math.min(G.wallX - r, x));
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

/** Where a point sits relative to the camera: how far ahead, how far off-axis. */
export function project(target: Aim, cam: Camera): { depth: number; lateral: number } {
  const yaw = (cam.yaw * Math.PI) / 180;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const dx = target.x - cam.x;
  const dz = target.z - cam.z;
  return { depth: dx * s - dz * c, lateral: dx * c + dz * s };
}

/** The case under the reticle, or null when you are looking at empty aisle. */
export function aimAt<T extends Aim>(
  targets: readonly T[],
  cam: Camera,
  opts: { lateral?: number; vertical?: number; near?: number; far?: number } = {},
): T | null {
  const { lateral = 112, vertical = 150, near = 130, far = 1500 } = opts;
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

/** Which aisle you are standing in. */
export function nearestAisle(aisleZ: readonly number[], z: number): number {
  let best = 0;
  let bestDist = Infinity;
  aisleZ.forEach((az, i) => {
    const d = Math.abs(az - z);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}
