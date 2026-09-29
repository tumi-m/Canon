import * as THREE from "three";
import type { Entry } from "@/lib/schema";
import { channelsFrom, thumbnailForEntry } from "@/lib/youtube";
import { G, GAP, hash, type Accepts, type Unit, type World } from "./world";
import type { Venue } from "./venues";
import {
  boardTexture,
  signTexture,
  coverTexture,
  disposeTextures,
  plaqueTexture,
  plasterTexture,
  screenTexture,
  weaveTexture,
  woodTexture,
} from "./textures";

/**
 * The room, on the GPU.
 *
 * `world.ts` still owns the model — where the shelves are, what is on them,
 * what you can walk into. This turns that description into meshes and lights.
 *
 * The move off CSS 3D deletes a whole class of bug rather than working around
 * it. A real depth buffer means paint order is no longer a coin toss, so
 * nothing has to be nudged "proud" of anything. A real frustum means props
 * behind you cost nothing and cannot smear across the view, so the culling
 * pass and its hysteresis are gone. A real camera has a near plane you choose,
 * so pressing your nose to a wall is just a close-up.
 */

/** World units are large (eye height ≈ 290); keep the camera's range to suit. */
const NEAR = 4;
const FAR = 9000;

/**
 * world.ts measures +y **downward** — floor at +290, ceiling at −300, eye at 0
 * — because that is how a CSS transform reads. three.js measures +y upward.
 * Every vertical coordinate crosses that boundary through here, so the room is
 * not built upside down and the reticle is not aimed at a mirror of it.
 */
const up = (worldY: number) => -worldY;

export type Hit = {
  readonly kind: "sleeve" | "capsule" | "tv" | "sign";
  readonly key: string;
  readonly entry: number | null;
  readonly label: string;
  /** the shelf this sits on — or the set, or the capsule — for the "where you are" badge */
  readonly shelf: string | null;
  /** a sign: what a piece added from it is filed as */
  readonly accepts?: Accepts;
};

/** The set is off, or on a channel — with its artwork once that arrives. */
export type Screen =
  | { readonly on: false }
  | {
      readonly on: true;
      readonly channel: string;
      readonly title: string;
      readonly image: HTMLImageElement | null;
    };

export type Stage = {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** everything the reticle can land on */
  readonly targets: THREE.Object3D[];
  /** what the set in the room is showing: nothing, or a channel */
  setScreen(state: Screen): void;
  /** lift whatever the reticle is on, and drop whatever it left */
  highlight(object: THREE.Object3D | null): void;
  resize(width: number, height: number, dpr: number): void;
  /**
   * Advance everything that moves on its own: dust in the lamplight, the
   * pendants, the capsule's glow, the set's flicker, and a case easing off
   * or back onto its shelf. `t` and `dt` are in seconds.
   */
  tick(t: number, dt: number): void;
  dispose(): void;
};

function meta(object: THREE.Object3D): Hit | undefined {
  return object.userData["hit"] as Hit | undefined;
}

export function hitOf(object: THREE.Object3D | null): Hit | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    const found = meta(node);
    if (found) return found;
    node = node.parent;
  }
  return null;
}

/** How deep the carcass is. A crate is a shallow box you flip through. */
const depthOf = (unit: Unit) => (unit.furniture === "crate" ? 74 : 150);

/** A shelf: a carcass, a back panel, and a shelf board under every row. */
function buildUnit(unit: Unit, timber: THREE.Material, board: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const depth = depthOf(unit);
  const t = 16;

  const shell = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), timber);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const w = unit.width;
  const h = unit.height;
  group.add(shell(w, t, depth, 0, -h / 2, 0)); // top
  group.add(shell(w, t, depth, 0, h / 2, 0)); // bottom
  group.add(shell(t, h, depth, -w / 2, 0, 0)); // left cheek
  group.add(shell(t, h, depth, w / 2, 0, 0)); // right cheek
  group.add(shell(w, h, t, 0, 0, -depth / 2)); // back panel

  for (let r = 1; r < unit.rows; r++) {
    const y = -h / 2 + (h / unit.rows) * r;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(w - t * 2, t * 0.7, depth - 8), board);
    plank.position.set(0, y, 4);
    plank.receiveShadow = true;
    group.add(plank);
  }
  return group;
}

/** Ease a value toward a target at a rate that does not depend on frame rate. */
const approach = (from: number, to: number, rate: number, dt: number) =>
  to + (from - to) * Math.exp(-rate * dt);

/** A soft round dot, for dust. Drawn, like every other texture here. */
function moteSprite(): THREE.Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
}

export function buildStage(
  canvas: HTMLCanvasElement,
  world: World,
  venue: Venue,
  entries: readonly Entry[],
  providerFor: (entry: Entry) => string,
  /** prefers-reduced-motion: nothing moves unless you move it */
  still = false,
): Stage {
  const p = venue.palette;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  /* Nothing that casts a shadow here ever moves — the shelves are furniture,
     the lamps hang still. A point light's shadow is a cube map, six extra
     renders of the whole scene, and with two lamps that was twelve extra
     passes every frame to redraw shadows identical to the last ones. They
     are drawn once, on the first frame, and kept. */
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(p.ceiling);
  // distance haze, which a fog node does properly instead of stacked planes
  scene.fog = new THREE.Fog(new THREE.Color(p.ceiling).getHex(), 900, 4200);

  const camera = new THREE.PerspectiveCamera(72, 1, NEAR, FAR);

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };

  /* ---------- materials ---------- */
  // boards in the den, library and cinema; poured stone in the vault and the bank
  const floorMat = keep(
    new THREE.MeshStandardMaterial(
      venue.floor === "stone"
        ? { map: plasterTexture(p.floor, [9, 10]), roughness: 0.82, metalness: 0.02 }
        : { map: woodTexture(p.floor, [7, 8]), roughness: 0.72, metalness: 0.04 },
    ),
  );
  const wallMat = keep(
    new THREE.MeshStandardMaterial({ map: plasterTexture(p.wall, [5, 2]), roughness: 0.94 }),
  );
  const ceilMat = keep(new THREE.MeshStandardMaterial({ color: p.ceiling, roughness: 1 }));
  const timberMat = keep(
    new THREE.MeshStandardMaterial({ map: woodTexture(p.timber, [2, 2]), roughness: 0.6 }),
  );
  const boardMat = keep(
    new THREE.MeshStandardMaterial({ map: woodTexture(p.timber, [3, 1]), roughness: 0.55 }),
  );
  const rugMat = keep(
    new THREE.MeshStandardMaterial({ map: weaveTexture(p.rugA, p.rugB, [5, 4]), roughness: 1 }),
  );
  const caseSide = keep(new THREE.MeshStandardMaterial({ color: "#100c0a", roughness: 0.42 }));

  /* ---------- the shell ---------- */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(G.roomX * 2, G.frontZ - G.backZ), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, up(G.floorY), (G.frontZ + G.backZ) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1340, 1000), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, up(G.floorY) + 1, -260);
  rug.receiveShadow = true;
  if (venue.rug) scene.add(rug);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(G.roomX * 2, G.frontZ - G.backZ), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, up(G.ceilY), (G.frontZ + G.backZ) / 2);
  scene.add(ceiling);

  const wallH = G.floorY - G.ceilY;
  const wallY = up((G.floorY + G.ceilY) / 2);
  const addWall = (w: number, x: number, z: number, ry: number) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), wallMat);
    wall.position.set(x, wallY, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    scene.add(wall);
  };
  const depth = G.frontZ - G.backZ;
  addWall(depth, -G.roomX, (G.frontZ + G.backZ) / 2, Math.PI / 2);
  addWall(depth, G.roomX, (G.frontZ + G.backZ) / 2, -Math.PI / 2);
  addWall(G.roomX * 2, 0, G.backZ, 0);
  addWall(G.roomX * 2, 0, G.frontZ, Math.PI);

  /* ---------- light ---------- */
  // the pendants alone leave the floor black: a decay-2 light 500 units up
  // reaches it at 1/250,000. ambient and bounce carry the room, the pendants
  // shape it.
  scene.add(new THREE.AmbientLight(new THREE.Color(p.light), p.ambient * 1.7));
  // sky/ground bounce: keeps the ceiling from going flat black and puts a
  // little of the floor's colour back up onto the undersides
  const bounce = new THREE.HemisphereLight(new THREE.Color(p.light), new THREE.Color(p.floor), 0.95);
  scene.add(bounce);
  // a soft key from over the shoulder so nothing is lit from one point only
  const key = new THREE.DirectionalLight(new THREE.Color(p.light), 0.5);
  key.position.set(600, 900, 900);
  scene.add(key);

  /* ---------- the light fittings ----------
     One light per lamp position whatever the building, with the fitting the
     building would actually have: a shade on a cord, an iron ring of candle
     bulbs, a fluorescent tube, a panel in the ceiling, a lamp on the wall. */
  const pendants: { group: THREE.Group; phase: number }[] = [];
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(p.light), toneMapped: false }));
  const ironMat = keep(new THREE.MeshStandardMaterial({ color: "#16110e", roughness: 0.7, metalness: 0.45 }));
  const shadeMat = keep(
    new THREE.MeshStandardMaterial({ color: p.timber, side: THREE.DoubleSide, roughness: 0.5 }),
  );
  const roof = up(G.ceilY);
  const rod = (length: number) => new THREE.Mesh(new THREE.CylinderGeometry(2, 2, length, 6), ironMat);

  for (const lamp of world.lamps) {
    const drop = Math.abs(lamp.y - G.ceilY);
    const phase = (hash(lamp.key) % 628) / 100;
    /** where the light itself sits, and how bright it is at this building's scale */
    let at = new THREE.Vector3(lamp.x, up(lamp.y) - 50, lamp.z);
    let candela = 1_400_000;

    if (venue.fixture === "pendant" || venue.fixture === "chandelier") {
      /* It hangs from a pivot at the ceiling rose, so it can sway the way a
         hanging fitting does in a draught. Only the fitting moves: the light
         stays put, because its shadows are drawn once and a light that
         wandered away from them would give the game away. */
      const fitting = new THREE.Group();
      fitting.position.set(lamp.x, roof, lamp.z);
      scene.add(fitting);
      pendants.push({ group: fitting, phase });

      if (venue.fixture === "pendant") {
        const shade = new THREE.Mesh(new THREE.ConeGeometry(84, 66, 24, 1, true), shadeMat);
        shade.position.set(0, -drop, 0);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 12), glowMat);
        bulb.position.set(0, -drop - 40, 0);
        const cord = rod(drop);
        cord.position.set(0, -drop / 2, 0);
        fitting.add(shade, bulb, cord);
      } else {
        // an iron hoop on four chains, a candle bulb at each of eight points
        const hang = drop + 50;
        const radius = 110;
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(radius, 4, 8, 40), ironMat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(0, -hang, 0);
        fitting.add(hoop);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const x = Math.cos(a) * radius;
          const z = Math.sin(a) * radius;
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 26, 8), ironMat);
          candle.position.set(x, -hang + 13, z);
          const flame = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 6), glowMat);
          flame.scale.y = 1.6;
          flame.position.set(x, -hang + 32, z);
          fitting.add(candle, flame);
          if (i % 2 === 0) {
            // a chain from the rose to every other candle
            // oriented in the fitting's own space: lookAt would read a world
            // matrix nobody has worked out yet
            const run = new THREE.Vector3(x, -hang, z);
            const chain = rod(run.length());
            chain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), run.clone().normalize());
            chain.position.copy(run.multiplyScalar(0.5));
            fitting.add(chain);
          }
        }
        at = new THREE.Vector3(lamp.x, roof - hang + 20, lamp.z);
      }
    } else if (venue.fixture === "strip" || venue.fixture === "panel") {
      // set into the ceiling: a lit face and the housing round it
      const strip = venue.fixture === "strip";
      const w = strip ? 46 : 280;
      const d = strip ? 900 : 280;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(w + 20, 14, d + 20), ironMat);
      housing.position.set(lamp.x, roof - 7, lamp.z);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, d), glowMat);
      face.rotation.x = Math.PI / 2;
      face.position.set(lamp.x, roof - 15, lamp.z);
      scene.add(housing, face);
      at = new THREE.Vector3(lamp.x, roof - 60, lamp.z);
      candela = 1_200_000;
    } else {
      // a sconce on the nearer side wall, throwing its light up and down it
      const side = lamp.x < 0 ? -1 : 1;
      const wall = side * G.roomX;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(10, 90, 50), ironMat);
      plate.position.set(wall - side * 5, 70, lamp.z);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(34, 22, 60, 20, 1, true), shadeMat);
      shade.position.set(wall - side * 40, 80, lamp.z);
      const lit = new THREE.Mesh(new THREE.CircleGeometry(33, 20), glowMat);
      lit.rotation.x = -Math.PI / 2;
      lit.position.set(wall - side * 40, 110, lamp.z);
      scene.add(plate, shade, lit);
      at = new THREE.Vector3(wall - side * 90, 110, lamp.z);
      candela = 700_000;
    }

    /* Intensity is in candela and falls off with the square of the distance,
       so it has to be expressed in the scale the world is actually built at.
       This room is ~2000 units across, not 2000 millimetres: at 700 units a
       decay-2 light is attenuated by 490,000, which is why an intensity of 1
       rendered as pitch black. */
    const light = new THREE.PointLight(new THREE.Color(p.light), candela, 5200, 2);
    light.position.copy(at);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.002;
    scene.add(light);
  }

  /* ---------- dust in the light ----------
     A few hundred motes drifting through the lamplight. It is the cheapest
     thing in the room — one draw call, a few hundred numbers a frame — and
     it is most of what makes still air read as air. */
  const MOTES = 320;
  const home = new Float32Array(MOTES * 3);
  const drift = new Float32Array(MOTES * 3);
  const seeded = (() => {
    let n = 0x9e3779b9;
    return () => {
      n = (n * 1664525 + 1013904223) >>> 0;
      return n / 0xffffffff;
    };
  })();
  for (let i = 0; i < MOTES; i++) {
    // gathered under the lamps, where lit dust is visible, with a few strays
    const lamp = world.lamps[i % Math.max(1, world.lamps.length)];
    const near = seeded() < 0.8 && lamp;
    home[i * 3] = near ? lamp.x + (seeded() - 0.5) * 900 : (seeded() - 0.5) * G.roomX * 1.8;
    home[i * 3 + 1] = up(G.floorY) + 40 + seeded() * (G.floorY - G.ceilY - 140);
    home[i * 3 + 2] = near ? lamp.z + (seeded() - 0.5) * 900 : G.backZ + seeded() * (G.frontZ - G.backZ);
    drift[i * 3] = seeded() * Math.PI * 2;
    drift[i * 3 + 1] = 0.12 + seeded() * 0.3;
    drift[i * 3 + 2] = 18 + seeded() * 40;
  }
  const moteGeometry = new THREE.BufferGeometry();
  const motePositions = new THREE.BufferAttribute(home.slice(), 3);
  motePositions.setUsage(THREE.DynamicDrawUsage);
  moteGeometry.setAttribute("position", motePositions);
  const dust = new THREE.Points(
    moteGeometry,
    keep(
      new THREE.PointsMaterial({
        color: new THREE.Color(p.light),
        map: keep(moteSprite()),
        size: 5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  dust.frustumCulled = false;
  scene.add(dust);

  /* ---------- shelves and sleeves ---------- */
  const targets: THREE.Object3D[] = [];
  const coverMaterials: THREE.Material[] = [];
  /** sleeve → the image we would like on its cover, once it arrives */
  const pending: { mesh: THREE.Mesh; entry: Entry; hue: number }[] = [];

  for (const unit of world.units) {
    const group = buildUnit(unit, timberMat, boardMat);
    group.position.set(unit.fx, up(unit.fy), unit.fz);
    group.rotation.y = (unit.rot * Math.PI) / 180;
    group.rotation.x = up(unit.tilt * Math.PI) / 180;
    scene.add(group);

    /* The shelf's name board, and the place to add to it. A bookcase's
       hangs under it — there is no headroom above one — and a crate's stands
       up out of it, like a card pushed in among the records. */
    const crate = unit.furniture === "crate";
    const signW = Math.min(unit.width - 30, crate ? 300 : 480);
    const signFace = keep(new THREE.MeshStandardMaterial({ map: keep(signTexture(unit.label, p.timber)), roughness: 0.6 }));
    const sign = new THREE.Mesh(new THREE.BoxGeometry(signW, signW * (150 / 1024), 8), [
      timberMat, timberMat, timberMat, timberMat, signFace, timberMat,
    ]);
    const signDepth = crate ? 74 : 150;
    sign.position.set(0, crate ? unit.height / 2 + 34 : -unit.height / 2 - 44, signDepth / 2 - 6);
    sign.userData["hit"] = {
      kind: "sign",
      key: `sign-${unit.key}`,
      entry: null,
      label: `add to ${unit.label}`,
      shelf: unit.label,
      accepts: unit.accepts,
    } satisfies Hit;
    group.add(sign);
    targets.push(sign);

    const slot = unit.slot;
    /* A case fills its slot *and* its gap, so neighbours touch. Anything less
       leaves a seam you can stand square in front of and aim straight through
       — the reticle is a real ray, and a real ray goes between two objects
       that do not meet. Height keeps a few units back for the shelf board. */
    const size = { w: slot.w + GAP, h: slot.h - 10 };
    for (const sleeve of unit.sleeves) {
      const entry = entries[sleeve.entry];
      if (!entry) continue;
      const hue = hash(entry.work.title) % 360;
      const cover = keep(
        new THREE.MeshStandardMaterial({
          map: coverTexture({
            title: entry.work.title,
            runtime: entry.work.runtime,
            provider: providerFor(entry),
            hue,
            changed: entry.weight === 3,
          }),
          roughness: 0.34,
        }),
      );
      coverMaterials.push(cover);

      // a case has a front, and five sides that are not the front
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.w, size.h, 22), [
        caseSide, caseSide, caseSide, caseSide, cover, caseSide,
      ]);
      // local offsets inside the unit, from the same numbers world.ts reports
      /* Stood in its carcass, not in front of it: a case is 22 deep, so its
         front proudmost face sits just inside the mouth of whatever holds it.
         A fixed 74 was a shelf's number, and left the crate's records hanging
         in the air half a case clear of the box. */
      const stand = depthOf(unit) / 2 - 12;
      mesh.position.set(sleeve.left + slot.w / 2 - unit.width / 2, up(sleeve.y - unit.fy), stand);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData["hit"] = {
        kind: "sleeve",
        key: sleeve.key,
        entry: sleeve.entry,
        label: entry.work.title,
        shelf: unit.label,
      } satisfies Hit;
      mesh.userData["rest"] = mesh.position.z;
      group.add(mesh);
      targets.push(mesh);
      pending.push({ mesh, entry, hue });
    }
  }

  /* ---------- the set ----------
     It was 720 units tall in a room 590 high: it went through the floor and
     the ceiling, and all anyone saw was a slab of black. It is a set on a
     sideboard now, at the height you would sit and watch it. */
  const channelCount = channelsFrom(entries).length;
  const standby = keep(
    screenTexture(
      channelCount
        ? [
            { text: "the set", size: 40, colour: "#7fa892", font: "serif" },
            { text: `${channelCount} channels of ${entries.length ? "this canon" : "nothing"}`, size: 22, colour: "#56705f", gap: 14 },
            { text: "press T to watch", size: 22, colour: "#9fd4b8", gap: 26 },
          ]
        : [
            { text: "no signal", size: 40, colour: "#56705f", font: "serif" },
            { text: "nothing on this canon plays on a screen", size: 22, colour: "#3e5246", gap: 14 },
          ],
      false,
    ),
  );
  const screenMat = keep(new THREE.MeshBasicMaterial({ map: standby, toneMapped: false }));
  const tv = new THREE.Group();
  const cabinetMat = keep(new THREE.MeshStandardMaterial({ color: "#1c1714", roughness: 0.42, metalness: 0.1 }));
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(780, 460, 70), cabinetMat);
  bezel.castShadow = true;
  tv.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(720, 405), screenMat);
  screen.position.z = 36;
  tv.add(screen);
  // the standby light: the one sign a switched-off set is plugged in
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(5, 10, 8),
    keep(new THREE.MeshBasicMaterial({ color: "#ff3b2a", toneMapped: false })),
  );
  led.position.set(350, -214, 36);
  tv.add(led);
  // the sideboard is low; the screen's centre sits just above eye level
  const sideboardH = 80;
  const TV_Y = up(G.floorY) + sideboardH + 20 + 230;
  const { set } = world;
  tv.position.set(set.x + set.depth / 2 - 50, TV_Y, set.z);
  tv.rotation.y = -Math.PI / 2;
  tv.userData["hit"] = {
    kind: "tv", key: "__tv", entry: null, label: "the television", shelf: world.screen.label,
  } satisfies Hit;
  scene.add(tv);
  targets.push(tv);

  // and what it stands on
  const sideboard = new THREE.Mesh(new THREE.BoxGeometry(set.depth, sideboardH, set.length), timberMat);
  sideboard.position.set(set.x, up(G.floorY) + sideboardH / 2, set.z);
  sideboard.castShadow = true;
  sideboard.receiveShadow = true;
  scene.add(sideboard);
  // a short neck from the sideboard's top to the bottom of the set
  const neck = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 120), cabinetMat);
  neck.position.set(set.x + set.depth / 2 - 60, up(G.floorY) + sideboardH + 10, set.z);
  scene.add(neck);

  // the screen is its own light source, the way a television actually is
  const glow = new THREE.PointLight(new THREE.Color("#9fd4ff"), 0, 3000, 2);
  glow.position.set(set.x - 160, TV_Y, set.z);
  scene.add(glow);

  /* ---------- the noticeboard ---------- */
  const { board } = world;
  const boardGroup = new THREE.Group();
  boardGroup.position.set(board.fx, up(board.fy), board.fz);
  boardGroup.rotation.y = (board.rot * Math.PI) / 180;
  const boardFace = keep(new THREE.MeshStandardMaterial({ map: keep(boardTexture()), roughness: 0.85 }));
  const panel = new THREE.Mesh(new THREE.BoxGeometry(board.width, board.height, 14), [
    timberMat, timberMat, timberMat, timberMat, boardFace, timberMat,
  ]);
  panel.castShadow = true;
  panel.userData["hit"] = {
    kind: "sign",
    key: "__board",
    entry: null,
    label: board.label,
    shelf: board.label,
    accepts: { weight: 3, highlighted: false },
  } satisfies Hit;
  boardGroup.add(panel);
  // an easel's legs, from the floor to under the board
  const legLength = board.height / 2 + (G.floorY - board.fy);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(14, legLength, 14), timberMat);
    leg.position.set(side * (board.width / 2 - 30), board.height / 2 - legLength / 2, -14);
    leg.castShadow = true;
    boardGroup.add(leg);
  }
  scene.add(boardGroup);
  targets.push(panel);

  /* ---------- the capsule ---------- */
  /* A strongbox standing on the floor, its face a brass plate and a seal.
     It used to be a pale slab hanging in the air and through the ceiling,
     and nobody would have guessed it was anything at all. */
  const capsuleSide = keep(
    new THREE.MeshStandardMaterial({
      map: woodTexture(p.timber, [1, 2]),
      roughness: 0.45,
      metalness: 0.2,
      // it breathes, faintly: the one thing in the room that is waiting
      emissive: new THREE.Color(p.light),
      emissiveIntensity: 0.04,
    }),
  );
  const capsuleFace = keep(
    new THREE.MeshStandardMaterial({
      map: keep(plaqueTexture(p.timber)),
      roughness: 0.35,
      metalness: 0.3,
      emissive: new THREE.Color(p.light),
      emissiveIntensity: 0.04,
    }),
  );
  const capsule = new THREE.Mesh(new THREE.BoxGeometry(world.capsule.width, world.capsule.height, 140), [
    capsuleSide, capsuleSide, capsuleSide, capsuleSide, capsuleFace, capsuleSide,
  ]);
  capsule.position.set(world.capsule.fx, up(world.capsule.fy), world.capsule.fz);
  capsule.rotation.y = (world.capsule.rot * Math.PI) / 180;
  capsule.castShadow = true;
  capsule.userData["hit"] = {
    kind: "capsule",
    key: "__capsule",
    entry: null,
    label: "the capsule",
    shelf: world.capsule.label,
  } satisfies Hit;
  scene.add(capsule);
  targets.push(capsule);

  /* ---------- artwork, once it loads ---------- */
  /* Artwork arrives whenever the network gets round to it — sometimes after
     this room has been torn down for a different building. A late arrival
     then painted a texture onto a disposed material and leaked it. */
  let disposed = false;
  const loading: HTMLImageElement[] = [];
  for (const { mesh, entry, hue } of pending) {
    const src = thumbnailForEntry(entry);
    if (!src) continue;
    const image = new Image();
    loading.push(image);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (disposed) return;
      const material = (mesh.material as THREE.Material[])[4] as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.map = coverTexture({
        title: entry.work.title,
        runtime: entry.work.runtime,
        provider: providerFor(entry),
        hue,
        changed: entry.weight === 3,
        image,
      });
      material.needsUpdate = true;
    };
    // a thumbnail that never arrives simply leaves the drawn cover in place
    image.src = src;
  }

  let lifted: THREE.Object3D | null = null;
  /** cases still easing off or back onto their shelf */
  const moving = new Set<THREE.Object3D>();
  let screenOn = false;
  const capsuleMats = [capsuleSide, capsuleFace];

  /** where a case wants to be: out and a touch larger if held, home if not */
  const settle = (object: THREE.Object3D, dt: number) => {
    const rest = object.userData["rest"] as number;
    const held = object === lifted;
    const z = held ? rest + 46 : rest;
    const k = held ? 1.06 : 1;
    if (still) {
      object.position.z = z;
      object.scale.setScalar(k);
      return true;
    }
    object.position.z = approach(object.position.z, z, 14, dt);
    object.scale.setScalar(approach(object.scale.x, k, 14, dt));
    return Math.abs(object.position.z - z) < 0.2 && Math.abs(object.scale.x - k) < 0.001;
  };

  return {
    scene,
    camera,
    renderer,
    targets,
    setScreen(state) {
      if (screenMat.map !== standby) screenMat.map?.dispose();
      if (!state.on) {
        screenOn = false;
        screenMat.map = standby;
        glow.intensity = 0;
      } else {
        screenOn = true;
        // the artwork if it arrived; otherwise the channel, set in type — a
        // deleted video or a blocked cdn should not leave a switched-on set dark
        screenMat.map = state.image
          ? new THREE.CanvasTexture(state.image)
          : screenTexture(
              [
                { text: state.channel, size: 30, colour: "#39ffa0" },
                { text: state.title, size: 44, colour: "#d8f3e4", gap: 18, font: "serif" },
              ],
              true,
            );
        screenMat.map.colorSpace = THREE.SRGBColorSpace;
        glow.intensity = 700_000;
      }
      screenMat.needsUpdate = true;
    },
    highlight(object) {
      if (lifted === object) return;
      if (lifted) moving.add(lifted);
      lifted = object && typeof object.userData["rest"] === "number" ? object : null;
      if (lifted) moving.add(lifted);
    },
    tick(t, dt) {
      for (const object of moving) if (settle(object, dt)) moving.delete(object);
      if (still) return;

      for (const { group, phase } of pendants) {
        group.rotation.z = Math.sin(t * 0.55 + phase) * 0.035;
        group.rotation.x = Math.cos(t * 0.41 + phase * 1.3) * 0.028;
      }

      const at = motePositions.array as Float32Array;
      for (let i = 0; i < MOTES; i++) {
        const phase = drift[i * 3]!;
        const speed = drift[i * 3 + 1]!;
        const reach = drift[i * 3 + 2]!;
        const a = t * speed + phase;
        at[i * 3] = home[i * 3]! + Math.sin(a) * reach;
        at[i * 3 + 1] = home[i * 3 + 1]! + Math.sin(a * 0.7 + phase) * reach * 0.6;
        at[i * 3 + 2] = home[i * 3 + 2]! + Math.cos(a * 0.9) * reach;
      }
      motePositions.needsUpdate = true;

      const breath = 0.03 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.1));
      for (const m of capsuleMats) m.emissiveIntensity = breath;

      // a picture changing on a screen changes the light it throws
      if (screenOn) {
        const shimmer = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.7) * 0.3 + Math.sin(t * 2.1) * 0.2;
        glow.intensity = 700_000 * (0.86 + 0.14 * shimmer);
      }
    },
    resize(width, height, dpr) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
    },
    dispose() {
      disposed = true;
      if (screenMat.map !== standby) screenMat.map?.dispose();
      for (const image of loading) image.onload = null;
      for (const thing of disposables) thing.dispose();
      for (const material of coverMaterials) {
        (material as THREE.MeshStandardMaterial).map?.dispose();
      }
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      disposeTextures();
      renderer.dispose();
    },
  };
}
