import { describe, expect, it } from "vitest";
import type { Entry } from "@/lib/schema";
import { aimAt, buildWorld, collide, G, nearestAisle, project, sectionsFor } from "./world";
import { getCanon } from "@/lib/canon";

const entries = getCanon("tumelo")!.entries;

const entry = (weight: 1 | 2 | 3, highlighted = false): Entry => ({
  work: { id: "w", kind: "youtube", title: "t", url: "https://e.com", runtime: "1m" },
  why: "because",
  weight,
  highlighted,
});

describe("sectionsFor", () => {
  it("puts every entry of a weight in its aisle", () => {
    const sections = sectionsFor([entry(3), entry(2), entry(3), entry(1)]);
    const changed = sections.find((s) => s.name === "CHANGED ME");
    expect(changed?.entries).toEqual([0, 2]);
  });

  it("drops aisles that would be empty", () => {
    const names = sectionsFor([entry(3), entry(3)]).map((s) => s.name);
    expect(names).toEqual(["CHANGED ME"]);
  });

  it("falls back to one shelf rather than an empty shop", () => {
    expect(sectionsFor([]).map((s) => s.name)).toEqual(["THE SHELF"]);
  });

  it("builds staff picks out of the highlighted entries", () => {
    const sections = sectionsFor([entry(2), entry(1, true)]);
    expect(sections.find((s) => s.name === "STAFF PICKS")?.entries).toEqual([1]);
  });
});

describe("buildWorld", () => {
  const world = buildWorld(entries);

  it("shelves every canon entry exactly once", () => {
    const shelved = world.bays
      .flatMap((b) => b.cases)
      .filter((c) => c.entry !== null)
      .map((c) => c.entry);
    // an entry can appear in two aisles (staff picks mirrors a weight aisle),
    // but every entry must be somewhere
    for (let i = 0; i < entries.length; i++) expect(shelved).toContain(i);
  });

  it("gives every case on a face a distinct world position", () => {
    for (const bay of world.bays) {
      const seen = new Set(bay.cases.map((c) => `${c.x}:${c.y}:${c.z}`));
      expect(seen.size).toBe(bay.cases.length);
    }
  });

  it("keeps case positions consistent with the markup they are rendered at", () => {
    for (const bay of world.bays) {
      for (const c of bay.cases) {
        const lx = c.left + 176 / 2 - bay.width / 2;
        expect(c.z).toBeCloseTo(bay.rot === 90 ? bay.fz - lx : bay.fz + lx, 6);
        expect(c.x).toBe(bay.fx);
      }
    }
  });

  it("hangs each aisle sign proud of the racks it labels", () => {
    // a shared z makes css 3d paint order a coin toss, and the racks win
    world.aisleZ.forEach((z, i) => {
      expect(world.signs[i]!.z).toBeGreaterThan(z);
    });
  });

  it("keeps the storefront further back than the perspective distance", () => {
    // anything straddling the eye plane magnifies toward infinity
    expect(world.marqueeZ - world.bounds.zMax).toBeGreaterThan(G.perspective);
  });

  it("puts the back room past the last aisle and the wall past the door", () => {
    const lastAisle = world.aisleZ.at(-1)!;
    expect(world.doorZ).toBeLessThan(lastAisle);
    expect(world.endZ).toBeLessThan(world.doorZ);
  });
});

describe("collide", () => {
  const world = buildWorld(entries);
  const { boxes, bounds } = world;

  it("stops you at the face of an island instead of inside it", () => {
    const [x] = collide(600, world.aisleZ[0]!, boxes, bounds);
    expect(x).toBe(640 - G.gondHalf - G.radius);
  });

  it("leaves the main aisle walkable", () => {
    expect(collide(0, world.aisleZ[0]!, boxes, bounds)).toEqual([0, world.aisleZ[0]!]);
  });

  it("keeps you inside the building", () => {
    const [x] = collide(9999, 0, boxes, bounds);
    expect(x).toBe(G.wallX - G.radius);
    const [, z] = collide(0, 99999, boxes, bounds);
    expect(z).toBe(bounds.zMax);
  });

  it("does not let you walk through the back-room door", () => {
    const [, z] = collide(0, world.endZ - 500, boxes, bounds);
    expect(z).toBe(bounds.zMin);
    expect(z).toBeGreaterThan(world.doorZ);
  });
});

describe("project", () => {
  it("puts what is straight ahead at positive depth, zero off-axis", () => {
    const p = project({ x: 0, y: 0, z: -500 }, { x: 0, z: 0, yaw: 0, pitch: 0 });
    expect(p.depth).toBeCloseTo(500);
    expect(p.lateral).toBeCloseTo(0);
  });

  it("reports what is behind you as negative depth", () => {
    expect(project({ x: 0, y: 0, z: 500 }, { x: 0, z: 0, yaw: 0, pitch: 0 }).depth)
      .toBeCloseTo(-500);
  });

  it("turning right moves what was ahead to your left", () => {
    const p = project({ x: 0, y: 0, z: -500 }, { x: 0, z: 0, yaw: 90, pitch: 0 });
    expect(p.lateral).toBeLessThan(0);
  });
});

describe("aimAt", () => {
  const near = { x: 0, y: 0, z: -300 };
  const far = { x: 0, y: 0, z: -900 };
  const cam = { x: 0, z: 0, yaw: 0, pitch: 0 };

  it("picks the nearest thing under the reticle", () => {
    expect(aimAt([far, near], cam)).toBe(near);
  });

  it("ignores what is off to the side", () => {
    expect(aimAt([{ x: 600, y: 0, z: -300 }], cam)).toBeNull();
  });

  it("ignores what is behind you", () => {
    expect(aimAt([{ x: 0, y: 0, z: 300 }], cam)).toBeNull();
  });

  it("ignores what is too close to focus on or too far to read", () => {
    expect(aimAt([{ x: 0, y: 0, z: -10 }], cam)).toBeNull();
    expect(aimAt([{ x: 0, y: 0, z: -9000 }], cam)).toBeNull();
  });

  it("follows the pitch of the camera up the shelf", () => {
    const high = { x: 0, y: -300, z: -400 };
    expect(aimAt([high], cam)).toBeNull();
    expect(aimAt([high], { ...cam, pitch: 34 })).toBe(high);
  });
});

describe("nearestAisle", () => {
  it("names the aisle you are standing in", () => {
    const { aisleZ } = buildWorld(entries);
    expect(nearestAisle(aisleZ, aisleZ[1]!)).toBe(1);
    expect(nearestAisle(aisleZ, aisleZ[0]! + 5000)).toBe(0);
  });
});
