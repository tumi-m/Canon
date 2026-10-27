import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/schema";
import { buildWorld, collide, G, nearestUnit, reach, sectionsFor, viewpointFor } from "./world";
import { getCanon } from "@/lib/canon";
import { VENUES } from "./venues";

const entries = getCanon("tumelo")!.entries;

const entry = (weight: 1 | 2 | 3, highlighted = false): Entry => ({
  work: { id: "w", kind: "youtube", title: "t", url: "https://e.com", runtime: "1m" },
  why: "because",
  weight,
  highlighted,
});

describe("sectionsFor", () => {
  it("puts every entry of a weight on its shelf", () => {
    const sections = sectionsFor([entry(3), entry(2), entry(3), entry(1)]);
    expect(sections.find((s) => s.name === "the ones that changed me")?.entries).toEqual([0, 2]);
  });

  it("drops shelves that would be empty", () => {
    expect(sectionsFor([entry(3), entry(3)]).map((s) => s.name)).toEqual([
      "the ones that changed me",
    ]);
  });

  it("falls back to one shelf rather than an empty room", () => {
    expect(sectionsFor([]).map((s) => s.name)).toEqual(["the shelf"]);
  });
});

describe("buildWorld", () => {
  const world = buildWorld(entries);

  it("puts every canon entry somewhere in the room", () => {
    // on a shelf, or in a place of its own in the memory palace
    const shelved = [
      ...world.units.flatMap((u) => u.sleeves).map((s) => s.entry),
      ...world.loci.map((l) => l.entry),
    ];
    for (let i = 0; i < entries.length; i++) expect(shelved).toContain(i);
  });

  it("gives every sleeve on a unit a distinct world position", () => {
    for (const unit of world.units) {
      const seen = new Set(unit.sleeves.map((s) => `${s.x.toFixed(2)}:${s.y}:${s.z.toFixed(2)}`));
      expect(seen.size).toBe(unit.sleeves.length);
    }
  });

  it("places sleeves consistently with the markup they are rendered at", () => {
    // the world position must be recoverable from the css `left` the sleeve is
    // drawn at, or the reticle points somewhere the sleeve is not
    for (const unit of world.units) {
      const theta = (unit.rot * Math.PI) / 180;
      const w = unit.slot.w;
      for (const s of unit.sleeves) {
        const lx = s.left + w / 2 - unit.width / 2;
        expect(s.x).toBeCloseTo(unit.fx + lx * Math.cos(theta), 6);
        expect(s.z).toBeCloseTo(unit.fz - lx * Math.sin(theta), 6);
      }
    }
  });

  it("shelves nothing that is not a canon entry", () => {
    // the cd wallet and the shoebox of sticks were cut: they held anonymous
    // clutter, not canon, and every sleeve in the room is a real entry now
    for (const unit of world.units) {
      expect(unit.sleeves.length).toBeGreaterThan(0);
      for (const sleeve of unit.sleeves) {
        expect(entries[sleeve.entry]).toBeDefined();
      }
    }
  });

  it("keeps every walkable spot inside the shell", () => {
    expect(world.bounds.zMin).toBeGreaterThan(G.backZ);
    expect(world.bounds.zMax).toBeLessThan(G.frontZ);
    expect(world.bounds.xMin).toBeGreaterThan(-G.roomX);
    expect(world.bounds.xMax).toBeLessThan(G.roomX);
  });
});

describe("collide", () => {
  const world = buildWorld(entries);
  const { boxes, bounds } = world;

  it("keeps you inside the room", () => {
    // a bare building, so nothing stands between you and the walls
    const bare = buildWorld(entries, undefined, false);
    const { boxes, bounds } = bare;
    // near the door the right-hand wall is clear; further in, the set stands there
    expect(collide(9999, 600, boxes, bounds)[0]).toBe(bounds.xMax);
    expect(collide(-9999, 0, boxes, bounds)[0]).toBe(bounds.xMin);
    expect(collide(0, 9999, boxes, bounds)[1]).toBe(bounds.zMax);
    // walking at the back wall stops you at the bookcase standing against it,
    // which is a little nearer than the wall itself
    const back = collide(0, -9999, boxes, bounds)[1];
    expect(back).toBeGreaterThanOrEqual(bounds.zMin);
    expect(back).toBeLessThan(0);
  });

  it("stops you at the set's sideboard before the wall behind it", () => {
    const [x] = collide(9999, world.set.z, boxes, bounds);
    expect(x).toBeLessThan(bounds.xMax);
    expect(x).toBeLessThanOrEqual(world.set.x - world.set.depth / 2);
  });

  it("stands no piece of furniture inside another", () => {
    // the set once stood straight through the shelf beside it
    const overlap = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
      a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlap(boxes[i]!, boxes[j]!), `box ${i} and box ${j} overlap`).toBe(false);
      }
    }
  });

  it("leaves somewhere to actually stand", () => {
    const spot = collide(0, G.spawnZ, boxes, bounds);
    expect(spot).toEqual([0, G.spawnZ]);
  });
});


describe("nearestUnit", () => {
  it("names the shelf you are standing at", () => {
    const world = buildWorld(entries);
    for (const shelf of world.units) {
      const at = nearestUnit(world.units, { x: shelf.fx, z: shelf.fz, yaw: 0, pitch: 0 });
      expect(at?.key).toBe(shelf.key);
    }
  });
});

describe("venues", () => {
  it("names the shelves in the vocabulary of the building", () => {
    const vault = sectionsFor(entries, ["sealed", "held", "deposited", "loose"]);
    expect(vault.map((s) => s.name)).toEqual(["sealed", "held", "deposited", "loose"]);
  });

  it("shelves the same canon whatever the building is called", () => {
    const den = buildWorld(entries);
    const vault = buildWorld(entries, ["sealed", "held", "deposited", "loose"]);
    const ids = (w: ReturnType<typeof buildWorld>) =>
      w.units.flatMap((u) => u.sleeves.map((s) => s.entry)).sort((a, b) => a - b);
    expect(ids(vault)).toEqual(ids(den));
  });

  it("gives every building its own light fitting, not just its own paint", () => {
    const fittings = VENUES.map((v) => v.fixture);
    expect(new Set(fittings).size).toBe(VENUES.length);
  });

  it("keeps rugs off concrete and rock", () => {
    for (const v of VENUES) if (v.floor === "stone") expect(v.rug).toBe(false);
  });

  it("falls back to the default name for any the venue leaves out", () => {
    expect(sectionsFor(entries, ["only one"])[0]?.name).toBe("only one");
    expect(sectionsFor(entries, [])[0]?.name).toBe("the ones that changed me");
  });
});

describe("viewpointFor", () => {
  const world = buildWorld(entries);

  it("stands you somewhere you could have walked to", () => {
    for (const unit of world.units) {
      const at = viewpointFor(unit, world);
      expect(collide(at.x, at.z, world.boxes, world.bounds)).toEqual([at.x, at.z]);
    }
  });

  it("faces you square on to the shelf", () => {
    for (const unit of world.units) {
      const at = viewpointFor(unit, world);
      const yaw = (at.yaw * Math.PI) / 180;
      const toShelf = Math.hypot(unit.fx - at.x, unit.fz - at.z);
      // forward is (sin yaw, -cos yaw); the shelf's centre should be dead ahead
      const ahead =
        (Math.sin(yaw) * (unit.fx - at.x) - Math.cos(yaw) * (unit.fz - at.z)) / toShelf;
      expect(ahead).toBeCloseTo(1, 6);
    }
  });

  it("looks down into a crate and up at a shelf", () => {
    for (const unit of world.units) {
      const at = viewpointFor(unit, world);
      // a crate and the coffee table are below your eyes; a bookcase is not
      if (unit.furniture === "shelf") expect(at.pitch).toBeGreaterThanOrEqual(0);
      else expect(at.pitch).toBeLessThan(0);
    }
  });

  it("stands further back on a screen held upright, so the whole shelf still fits", () => {
    const back = world.units[0]!;
    const wide = viewpointFor(back, world, 16 / 9);
    const tall = viewpointFor(back, world, 390 / 844);
    const from = (p: { x: number; z: number }) => Math.hypot(back.fx - p.x, back.fz - p.z);
    expect(from(tall)).toBeGreaterThan(from(wide) * 1.5);
  });

  it("puts the back bookcase straight ahead of the door", () => {
    const back = world.units[0]!;
    expect(viewpointFor(back, world).yaw).toBeCloseTo(0, 6);
  });
});

describe("a canon of any size", () => {
  /** a canon with a given number of pieces on each tier */
  const canonOf = (changed: number, great: number, solid: number, picks = 0): Entry[] => {
    const make = (weight: 1 | 2 | 3, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...entry(weight, weight === 3 && i < picks),
        work: { id: `${weight}-${i}`, kind: "youtube" as const, title: `t${weight}-${i}`, url: "https://e.com", runtime: "1m" },
      }));
    return [...make(3, changed), ...make(2, great), ...make(1, solid)];
  };

  const sizes: [number, number, number, number][] = [];
  for (const n of [1, 2, 4, 5, 6, 9, 10, 11, 16, 24, 40]) {
    sizes.push([n, 0, 0, 0], [0, n, 0, 0], [3, n, 2, 1], [n, n, n, Math.min(n, 6)]);
  }

  it.each(sizes)("fits %i / %i / %i (picks %i) inside the room", (a, b, c, d) => {
    const world = buildWorld(canonOf(a, b, c, d));
    for (const unit of world.units) {
      // the pile on the coffee table lies flat: its "height" runs along the tabletop
      if (unit.furniture === "table") continue;
      const top = unit.fy - unit.height / 2;
      const bottom = unit.fy + unit.height / 2;
      // +y is down: the ceiling is the smaller number
      expect(top, `${unit.label} goes through the ceiling`).toBeGreaterThanOrEqual(G.ceilY);
      expect(bottom, `${unit.label} goes through the floor`).toBeLessThanOrEqual(G.floorY);
      expect(Math.abs(unit.fx) + (unit.rot === 0 ? unit.width / 2 : 0)).toBeLessThanOrEqual(G.roomX);
    }
  });

  it.each(sizes)("stands nothing inside anything else at %i / %i / %i (picks %i)", (a, b, c, d) => {
    const { boxes } = buildWorld(canonOf(a, b, c, d));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i]!, boxes[j]!];
        const overlap = p.x0 < q.x1 && p.x1 > q.x0 && p.z0 < q.z1 && p.z1 > q.z0;
        expect(overlap, `box ${i} and box ${j} overlap`).toBe(false);
      }
    }
  });

  it.each(sizes)("shelves every piece at %i / %i / %i (picks %i)", (a, b, c, d) => {
    const entries = canonOf(a, b, c, d);
    const world = buildWorld(entries);
    const shelved = new Set([
      ...world.units.flatMap((u) => u.sleeves.map((s) => s.entry)),
      ...world.loci.map((l) => l.entry),
    ]);
    for (let i = 0; i < entries.length; i++) expect(shelved.has(i), `piece ${i} is nowhere`).toBe(true);
  });
});

describe("the living room", () => {
  const world = buildWorld(entries);
  const home = world.home!;

  it("is furnished by default, and the bare buildings are not", () => {
    expect(world.home).not.toBeNull();
    expect(buildWorld(entries, undefined, false).home).toBeNull();
  });

  it("keeps every piece of furniture inside the walls", () => {
    for (const piece of home.furniture) {
      const { dx, dz } = reach(piece.width, piece.depth, piece.rot);
      expect(Math.abs(piece.x) + dx, piece.key).toBeLessThanOrEqual(G.roomX + 0.001);
      expect(piece.z - dz, piece.key).toBeGreaterThanOrEqual(G.backZ - 0.001);
      expect(piece.z + dz, piece.key).toBeLessThanOrEqual(G.frontZ);
    }
  });

  it("leaves a clear walk from the door to the bookcase", () => {
    // straight down the middle, a stride at a time: nothing turns you aside
    for (let z = G.spawnZ; z > world.bounds.zMin; z -= 40) {
      expect(collide(0, z, world.boxes, world.bounds)[0], `pushed aside at z=${z}`).toBe(0);
    }
  });

  it("puts the window in the back wall beside the bookcase, not behind it", () => {
    const shelf = world.units[0]!;
    expect(home.window.x - home.window.width / 2).toBeGreaterThan(shelf.fx + shelf.width / 2);
    expect(home.window.x + home.window.width / 2).toBeLessThan(G.roomX);
  });

  it("can walk you to the noticeboard by the door", () => {
    const at = viewpointFor(world.board, world);
    expect(collide(at.x, at.z, world.boxes, world.bounds)).toEqual([at.x, at.z]);
  });
});

describe("the memory palace", () => {
  const world = buildWorld(entries);
  const changed = entries.flatMap((e, i) => (e.weight === 3 ? [i] : []));

  it("hangs the piece that changed you most over the mantel, and stands the next two on it", () => {
    expect(world.loci.map((l) => l.key)).toEqual(["over-mantel", "mantel-left", "mantel-right"]);
    expect(world.loci.map((l) => l.entry)).toEqual(changed.slice(0, 3));
  });

  it("takes them off the bookcase, rather than keeping a second copy there", () => {
    const back = world.units.find((u) => u.accepts.weight === 3 && !u.accepts.highlighted)!;
    const onShelf = back.sleeves.map((s) => s.entry);
    for (const locus of world.loci) expect(onShelf).not.toContain(locus.entry);
    expect(onShelf).toEqual(changed.slice(3));
  });

  it("lays the played-to-death pile on the coffee table", () => {
    const pile = world.units.find((u) => u.accepts.highlighted)!;
    expect(pile.furniture).toBe("table");
    const table = world.home!.furniture.find((f) => f.key === "coffee-table")!;
    // somewhere on the tabletop: it runs along z, the long way
    expect(Math.abs(pile.fx - table.x)).toBeLessThan(table.depth / 2);
    expect(Math.abs(pile.fz - table.z)).toBeLessThan(table.width / 2);
  });

  it("files each tier by what it is, not by its place in the list", () => {
    // no picks at all: the good shelf must still go to the right-hand wall
    const noPicks = entries.map((e) => ({ ...e, highlighted: false }));
    const good = buildWorld(noPicks).units.find((u) => u.accepts.weight === 2)!;
    expect(good.fx).toBeGreaterThan(0);
    expect(good.furniture).toBe("shelf");
  });

  it("keeps the mantel pieces inside the room, facing into it", () => {
    for (const l of world.loci) {
      expect(l.x).toBeGreaterThan(-G.roomX);
      expect(l.y - l.height / 2).toBeGreaterThan(G.ceilY);
      expect(Math.sin((l.rot * Math.PI) / 180)).toBeGreaterThan(0.99); // facing +x, into the room
    }
  });

  it("can walk you to the fireplace", () => {
    const at = viewpointFor(world.hearth!, world);
    expect(collide(at.x, at.z, world.boxes, world.bounds)).toEqual([at.x, at.z]);
  });

  it("leaves a bare building without one", () => {
    const bare = buildWorld(entries, undefined, false);
    expect(bare.loci).toEqual([]);
    expect(bare.hearth).toBeNull();
  });
});

