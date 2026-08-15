import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/schema";
import { aimAt, buildWorld, collide, G, nearestUnit, project, sectionsFor } from "./world";
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
      const widths: Record<string, number> = { shelf: 184, crate: 208 };
      const w = widths[unit.furniture]!;
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

  it("keeps the whole room in front of the eye plane from anywhere you can stand", () => {
    // anything straddling the perspective distance smears across the view
    expect(G.frontZ - world.bounds.zMax).toBeLessThan(G.perspective);
    expect(world.bounds.zMin).toBeGreaterThan(G.backZ);
  });
});

describe("collide", () => {
  const world = buildWorld(entries);
  const { boxes, bounds } = world;

  it("keeps you inside the room", () => {
    expect(collide(9999, 0, boxes, bounds)[0]).toBe(bounds.xMax);
    expect(collide(-9999, 0, boxes, bounds)[0]).toBe(bounds.xMin);
    expect(collide(0, 9999, boxes, bounds)[1]).toBe(bounds.zMax);
    // walking at the back wall stops you at the bookcase standing against it,
    // which is a little nearer than the wall itself
    const back = collide(0, -9999, boxes, bounds)[1];
    expect(back).toBeGreaterThanOrEqual(bounds.zMin);
    expect(back).toBeLessThan(0);
  });

  it("leaves somewhere to actually stand", () => {
    const spot = collide(0, G.spawnZ, boxes, bounds);
    expect(spot).toEqual([0, G.spawnZ]);
  });
});

describe("project", () => {
  it("puts what is straight ahead at positive depth, zero off-axis", () => {
    const p = project({ x: 0, y: 0, z: -500 }, { x: 0, z: 0, yaw: 0, pitch: 0 });
    expect(p.depth).toBeCloseTo(500);
    expect(p.lateral).toBeCloseTo(0);
  });

  it("reports what is behind you as negative depth", () => {
    expect(project({ x: 0, y: 0, z: 500 }, { x: 0, z: 0, yaw: 0, pitch: 0 }).depth).toBeCloseTo(
      -500,
    );
  });

  it("turning right moves what was ahead to your left", () => {
    expect(project({ x: 0, y: 0, z: -500 }, { x: 0, z: 0, yaw: 90, pitch: 0 }).lateral).toBeLessThan(
      0,
    );
  });
});

describe("aimAt", () => {
  const near = { x: 0, y: 0, z: -300 };
  const far = { x: 0, y: 0, z: -900 };
  const cam = { x: 0, z: 0, yaw: 0, pitch: 0 };

  it("picks the nearest thing under the reticle", () => {
    expect(aimAt([far, near], cam)).toBe(near);
  });

  it("ignores what is off to the side, behind, too close or too far", () => {
    expect(aimAt([{ x: 700, y: 0, z: -300 }], cam)).toBeNull();
    expect(aimAt([{ x: 0, y: 0, z: 300 }], cam)).toBeNull();
    expect(aimAt([{ x: 0, y: 0, z: -10 }], cam)).toBeNull();
    expect(aimAt([{ x: 0, y: 0, z: -9000 }], cam)).toBeNull();
  });

  it("follows the pitch of the camera — down to the crate, up to the top shelf", () => {
    const low = { x: 0, y: 260, z: -400 };
    expect(aimAt([low], cam)).toBeNull();
    expect(aimAt([low], { ...cam, pitch: -34 })).toBe(low);
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
