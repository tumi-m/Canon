import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/schema";
import { buildWorld, collide, G, nearestUnit, sectionsFor, SLEEVE, viewpointFor } from "./world";
import { getCanon } from "@/lib/canon";

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
    const shelved = world.units
      .flatMap((u) => u.sleeves)
      .filter((s) => s.entry !== null)
      .map((s) => s.entry);
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
      const w = SLEEVE[unit.furniture].w;
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
      if (unit.furniture === "crate") expect(at.pitch).toBeLessThan(0);
      else expect(at.pitch).toBeGreaterThanOrEqual(0);
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

