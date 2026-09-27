import * as THREE from "three";
import type { Entry } from "@/lib/schema";
import { thumbnailForEntry } from "@/lib/youtube";
import { G, GAP, hash, SLEEVE, type Unit, type World } from "./world";
import type { Venue } from "./venues";
import { coverTexture, disposeTextures, plasterTexture, weaveTexture, woodTexture } from "./textures";

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
  readonly kind: "sleeve" | "capsule" | "tv";
  readonly key: string;
  readonly entry: number | null;
  readonly label: string;
  /** the shelf this sits on, for the "where you are" badge */
  readonly shelf: string | null;
};

export type Stage = {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** everything the reticle can land on */
  readonly targets: THREE.Object3D[];
  /** put the artwork for the playing channel on the screen, or clear it */
  setScreen(image: HTMLImageElement | null): void;
  /** lift whatever the reticle is on, and drop whatever it left */
  highlight(object: THREE.Object3D | null): void;
  resize(width: number, height: number, dpr: number): void;
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

export function buildStage(
  canvas: HTMLCanvasElement,
  world: World,
  venue: Venue,
  entries: readonly Entry[],
  providerFor: (entry: Entry) => string,
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
  const floorMat = keep(
    new THREE.MeshStandardMaterial({
      map: woodTexture(p.floor, [7, 8]),
      roughness: 0.72,
      metalness: 0.04,
    }),
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
  scene.add(rug);

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

  for (const lamp of world.lamps) {
    /* Intensity is in candela and falls off with the square of the distance,
       so it has to be expressed in the scale the world is actually built at.
       This room is ~2000 units across, not 2000 millimetres: at 700 units a
       decay-2 light is attenuated by 490,000, which is why an intensity of 1
       rendered as pitch black. */
    const light = new THREE.PointLight(new THREE.Color(p.light), 1_400_000, 5200, 2);
    light.position.set(lamp.x, up(lamp.y) - 50, lamp.z);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.002;
    scene.add(light);

    // the fitting itself: a shade you can see, with a bulb glowing under it
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(84, 66, 24, 1, true),
      keep(new THREE.MeshStandardMaterial({ color: p.timber, side: THREE.DoubleSide, roughness: 0.5 })),
    );
    shade.position.set(lamp.x, up(lamp.y), lamp.z);
    scene.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(22, 16, 12),
      keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(p.light), toneMapped: false })),
    );
    bulb.position.set(lamp.x, up(lamp.y) - 40, lamp.z);
    scene.add(bulb);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, Math.abs(lamp.y - G.ceilY), 6),
      keep(new THREE.MeshStandardMaterial({ color: "#120d0b", roughness: 1 })),
    );
    cord.position.set(lamp.x, up((G.ceilY + lamp.y) / 2), lamp.z);
    scene.add(cord);
  }

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

    const slot = SLEEVE[unit.furniture];
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

  /* ---------- the set ---------- */
  const screenMat = keep(new THREE.MeshBasicMaterial({ color: "#0a0f0d" }));
  const tv = new THREE.Group();
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(1180, 720, 90),
    keep(new THREE.MeshStandardMaterial({ color: "#211c19", roughness: 0.5 })),
  );
  bezel.castShadow = true;
  tv.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1080, 610), screenMat);
  screen.position.z = 47;
  tv.add(screen);
  tv.position.set(1035, up(-40), -280);
  tv.rotation.y = -Math.PI / 2;
  tv.userData["hit"] = {
    kind: "tv", key: "__tv", entry: null, label: "the television", shelf: null,
  } satisfies Hit;
  scene.add(tv);
  targets.push(tv);

  // the screen is its own light source, the way a television actually is
  const glow = new THREE.PointLight(new THREE.Color("#9fd4ff"), 0, 3000, 2);
  glow.position.set(900, up(-40), -280);
  scene.add(glow);

  /* ---------- the capsule ---------- */
  const capsule = new THREE.Mesh(
    new THREE.BoxGeometry(400, 500, 60),
    keep(new THREE.MeshStandardMaterial({ color: p.timber, roughness: 0.45, metalness: 0.25 })),
  );
  capsule.position.set(-690, up(-70), world.hatchZ + 40);
  capsule.rotation.y = (18 * Math.PI) / 180;
  capsule.castShadow = true;
  capsule.userData["hit"] = {
    kind: "capsule",
    key: "__capsule",
    entry: null,
    label: "the capsule",
    shelf: null,
  } satisfies Hit;
  scene.add(capsule);
  targets.push(capsule);

  /* ---------- artwork, once it loads ---------- */
  for (const { mesh, entry, hue } of pending) {
    const src = thumbnailForEntry(entry);
    if (!src) continue;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
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

  return {
    scene,
    camera,
    renderer,
    targets,
    setScreen(image) {
      if (image) {
        const texture = new THREE.CanvasTexture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        screenMat.map?.dispose();
        screenMat.map = texture;
        screenMat.color.set("#ffffff");
        glow.intensity = 700_000;
      } else {
        screenMat.map?.dispose();
        screenMat.map = null;
        screenMat.color.set("#0a0f0d");
        glow.intensity = 0;
      }
      screenMat.needsUpdate = true;
    },
    highlight(object) {
      if (lifted === object) return;
      if (lifted) {
        lifted.position.z = (lifted.userData["rest"] as number | undefined) ?? lifted.position.z;
        lifted.scale.setScalar(1);
      }
      lifted = object;
      if (object && typeof object.userData["rest"] === "number") {
        object.position.z = (object.userData["rest"] as number) + 46;
        object.scale.setScalar(1.06);
      }
    },
    resize(width, height, dpr) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
    },
    dispose() {
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
