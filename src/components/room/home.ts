import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { G, type Furnishing, type World } from "./world";
import type { Palette } from "./venues";
import { brickTexture, clockFaceTexture, leafTexture, nightTexture, weaveTexture } from "./textures";
import { lightSource } from "./trace";
import type { HomeAnchors } from "./atmosphere";

/**
 * The furniture that makes the den a home: a sofa facing the set, a leather
 * armchair turned to the fire, a coffee table, a lamp on a side table, plants,
 * a window with the night in it, beams, panelling, and the door you came in
 * by. None of it holds the canon; all of it is why the canon feels kept
 * rather than displayed.
 *
 * Positions come from world.ts, which also owns the collision boxes, so what
 * you see and what you bump into are the same thing.
 */

/** world.ts is +y down; three.js is +y up. See scene.ts. */
const up = (worldY: number) => -worldY;
const FLOOR = up(G.floorY);

export type HomeParts = {
  /** the light the fire throws, a candle, curtains in a draught */
  tick(t: number, dt: number): void;
  /** where the air's moving things come from: the fire, the mug, the moon */
  readonly anchors: HomeAnchors;
};

type Keep = <T extends { dispose(): void }>(thing: T) => T;

const rounded = (w: number, h: number, d: number, r: number) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

/** A group standing on the floor at a furnishing's spot, turned to face its way. */
function standing(piece: Furnishing): THREE.Group {
  const group = new THREE.Group();
  group.position.set(piece.x, FLOOR, piece.z);
  group.rotation.y = (piece.rot * Math.PI) / 180;
  return group;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildHome(
  scene: THREE.Scene,
  world: World,
  p: Palette,
  timber: THREE.Material,
  keep: Keep,
  still: boolean,
): HomeParts {
  const home = world.home!;
  const piece = (key: Furnishing["key"]) => home.furniture.find((f) => f.key === key)!;

  /* ---------- materials ---------- */
  const velvet = keep(
    new THREE.MeshPhysicalMaterial({
      map: weaveTexture(p.rugA, p.rugB, [3, 3]),
      roughness: 0.92,
      sheen: 1,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color(p.rugB).offsetHSL(0, 0, 0.18),
    }),
  );
  const leather = keep(
    new THREE.MeshPhysicalMaterial({ color: "#5b3424", roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.6 }),
  );
  const darkWood = keep(new THREE.MeshStandardMaterial({ color: "#24170f", roughness: 0.55 }));
  const brass = keep(new THREE.MeshStandardMaterial({ color: "#c49a4a", roughness: 0.32, metalness: 0.85 }));
  const linen = keep(
    new THREE.MeshStandardMaterial({ color: "#d9ccb0", roughness: 0.95, side: THREE.DoubleSide }),
  );
  const ceramic = keep(new THREE.MeshPhysicalMaterial({ color: "#efe6d6", roughness: 0.3, clearcoat: 0.6 }));
  const terracotta = keep(new THREE.MeshStandardMaterial({ color: "#a4573a", roughness: 0.85 }));
  const soil = keep(new THREE.MeshStandardMaterial({ color: "#2a1d14", roughness: 1 }));
  const leaf = keep(
    new THREE.MeshStandardMaterial({
      map: leafTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.65,
    }),
  );
  const brick = keep(new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 }));
  const slate = keep(new THREE.MeshStandardMaterial({ color: "#2c2c2e", roughness: 0.7 }));
  const soot = keep(new THREE.MeshStandardMaterial({ color: "#0b0807", roughness: 1 }));
  // a flame is where the light comes from: shadow rays go through it
  const coreMat = keep(lightSource("#ffe39a", 3, { transparent: true, opacity: 0.95, depthWrite: false }));
  const lampGlow = keep(lightSource(p.light, 2.6));
  const shade = keep(
    new THREE.MeshStandardMaterial({
      color: "#e9dcc0",
      emissive: new THREE.Color(p.light),
      emissiveIntensity: 0.35,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
  );

  /* ---------- the sofa, facing the set ---------- */
  const upholstered = (group: THREE.Group, w: number, d: number, fabric: THREE.Material, seats: number) => {
    const legH = 24;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        group.add(mesh(new THREE.CylinderGeometry(7, 5, legH, 10), darkWood, sx * (w / 2 - 28), legH / 2, sz * (d / 2 - 26)));
      }
    }
    group.add(mesh(rounded(w, 70, d, 14), fabric, 0, legH + 35, 0));
    const arm = 40;
    const seatW = (w - arm * 2) / seats;
    for (let i = 0; i < seats; i++) {
      const x = -w / 2 + arm + seatW * (i + 0.5);
      group.add(mesh(rounded(seatW - 6, 38, d - 70, 14), fabric, x, legH + 70 + 19, 22));
      const back = mesh(rounded(seatW - 6, 120, 40, 18), fabric, x, legH + 70 + 66, -d / 2 + 62);
      back.rotation.x = -0.14;
      group.add(back);
    }
    group.add(mesh(rounded(w, 190, 50, 18), fabric, 0, legH + 95, -d / 2 + 25));
    for (const sx of [-1, 1]) group.add(mesh(rounded(arm, 128, d, 16), fabric, sx * (w / 2 - arm / 2), legH + 64, 0));
  };

  const sofaSpot = piece("sofa");
  const sofa = standing(sofaSpot);
  upholstered(sofa, sofaSpot.width, sofaSpot.depth, velvet, 3);
  // a cushion somebody threw down
  const cushion = mesh(rounded(74, 74, 22, 10), linen, sofaSpot.width / 2 - 92, 160, -18);
  cushion.rotation.set(-0.35, 0.25, 0.32);
  sofa.add(cushion);
  scene.add(sofa);

  /* ---------- the armchair, turned to the fire ---------- */
  const chairSpot = piece("armchair");
  const chair = standing(chairSpot);
  upholstered(chair, chairSpot.width, chairSpot.depth, leather, 1);
  scene.add(chair);

  /* ---------- the coffee table, and what is on it ---------- */
  const tableSpot = piece("coffee-table");
  const table = standing(tableSpot);
  const tw = tableSpot.width;
  const td = tableSpot.depth;
  table.add(mesh(rounded(tw, 18, td, 6), timber, 0, 110, 0));
  table.add(mesh(new THREE.BoxGeometry(tw - 40, 8, td - 30), timber, 0, 34, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) table.add(mesh(new THREE.BoxGeometry(14, 102, 14), darkWood, sx * (tw / 2 - 18), 51, sz * (td / 2 - 18)));
  }
  // a stack of books, a mug, and a candle that has been lit a few times
  // the near end: books. the far end: the mug and the candle. the middle is
  // left for the pile of cases that lives there
  [["#7a2e24", 0], ["#2e4a5c", 0.12], ["#c9b78a", -0.08]].forEach(([colour, turn], i) => {
    const book = mesh(new THREE.BoxGeometry(68, 14, 58), keep(new THREE.MeshStandardMaterial({ color: colour as string, roughness: 0.8 })), -tw / 2 + 46, 126 + i * 14, -6);
    book.rotation.y = turn as number;
    table.add(book);
  });
  const mug = new THREE.Group();
  mug.add(mesh(new THREE.CylinderGeometry(14, 13, 30, 20), ceramic, 0, 15, 0));
  const handle = mesh(new THREE.TorusGeometry(9, 3, 8, 16), ceramic, 15, 16, 0);
  handle.rotation.y = Math.PI / 2;
  mug.add(handle);
  mug.position.set(tw / 2 - 26, 119, 30);
  table.add(mug);
  table.add(mesh(new THREE.CylinderGeometry(10, 10, 36, 16), ceramic, tw / 2 - 24, 137, -34));
  const candleFlame = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), coreMat);
  candleFlame.scale.y = 1.8;
  candleFlame.position.set(tw / 2 - 24, 164, -34);
  table.add(candleFlame);
  scene.add(table);

  /* ---------- the side table and its lamp ---------- */
  const sideSpot = piece("side-table");
  const side = standing(sideSpot);
  side.add(mesh(new THREE.CylinderGeometry(50, 50, 10, 32), timber, 0, 150, 0));
  side.add(mesh(new THREE.CylinderGeometry(7, 7, 145, 12), darkWood, 0, 75, 0));
  side.add(mesh(new THREE.CylinderGeometry(32, 36, 8, 24), darkWood, 0, 4, 0));
  side.add(mesh(new THREE.CylinderGeometry(15, 18, 24, 20), ceramic, 0, 167, 0));
  side.add(mesh(new THREE.CylinderGeometry(3, 3, 62, 8), brass, 0, 210, 0));
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(30, 44, 52, 24, 1, true), shade);
  lampShade.position.set(0, 252, 0);
  side.add(lampShade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 10), lampGlow);
  bulb.position.set(0, 236, 0);
  side.add(bulb);
  scene.add(side);
  // a pool of warm light low in the room: the light a home is actually lit by
  const lamp = new THREE.PointLight(new THREE.Color(p.light), 260_000, 2200, 2);
  lamp.position.set(sideSpot.x, FLOOR + 236, sideSpot.z);
  scene.add(lamp);

  /* ---------- the fireplace ---------- */
  const fireSpot = piece("fireplace");
  const fire = standing(fireSpot);
  const fw = fireSpot.width;
  const back = -fireSpot.depth / 2;
  const roomH = G.floorY - G.ceilY;
  // the chimney breast, floor to ceiling, in brick
  const breast = mesh(new THREE.BoxGeometry(fw + 60, roomH, 70), brick, 0, roomH / 2, back + 35);
  fire.add(breast);
  // the firebox: dark, recessed between two brick piers
  fire.add(mesh(new THREE.BoxGeometry(230, 180, 8), soot, 0, 92, back + 74));
  for (const sx of [-1, 1]) fire.add(mesh(new THREE.BoxGeometry(115, 200, 46), brick, sx * (230 / 2 + 115 / 2), 100, back + 93));
  fire.add(mesh(new THREE.BoxGeometry(230, 28, 46), brick, 0, 190, back + 93));
  // the mantel shelf, and the hearth stone in front
  fire.add(mesh(new THREE.BoxGeometry(fw + 20, 22, 112), timber, 0, 214, back + 104));
  fire.add(mesh(new THREE.BoxGeometry(fw, 10, 120), slate, 0, 5, back + 176));
  // logs
  for (const [x, turn] of [[-30, 0.35], [30, -0.35], [0, Math.PI / 2]] as const) {
    const log = mesh(new THREE.CylinderGeometry(10, 11, 130, 10), darkWood, x, 22, back + 120);
    log.rotation.set(Math.PI / 2, 0, turn);
    fire.add(log);
  }
  /* The flames themselves are not furniture: they are drawn in the air
     (atmosphere.ts), so they go on burning over a traced still. */
  scene.add(fire);
  const fireLight = new THREE.PointLight(new THREE.Color("#ff8f45"), 520_000, 2600, 2);
  const local = new THREE.Vector3(0, 70, back + 150);
  fire.updateMatrixWorld(true);
  fireLight.position.copy(fire.localToWorld(local));
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024);
  fireLight.shadow.bias = -0.002;
  scene.add(fireLight);

  /* ---------- plants ---------- */
  const plant = (spot: Furnishing, tall: boolean) => {
    const group = standing(spot);
    const r = tall ? 46 : 34;
    const h = tall ? 90 : 64;
    group.add(mesh(new THREE.CylinderGeometry(r, r * 0.74, h, 24), terracotta, 0, h / 2, 0));
    group.add(mesh(new THREE.CylinderGeometry(r - 5, r - 5, 4, 20), soil, 0, h - 4, 0));
    const count = tall ? 16 : 9;
    for (let i = 0; i < count; i++) {
      const a = i * 2.399; // the golden angle, the way leaves actually arrange themselves
      const lift = h + (tall ? 30 + (i / count) * 230 : 10 + (i / count) * 90);
      const len = tall ? 110 : 80;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.5, len), leaf);
      blade.position.set(Math.cos(a) * 26, lift, Math.sin(a) * 26);
      blade.rotation.set(-0.9 + (i % 3) * 0.2, -a + Math.PI / 2, 0.2);
      blade.castShadow = true;
      group.add(blade);
    }
    if (tall) group.add(mesh(new THREE.CylinderGeometry(4, 5, 260, 8), darkWood, 0, h + 130, 0));
    scene.add(group);
  };
  plant(piece("plant-window"), true);
  plant(piece("plant-sofa"), false);

  /* ---------- the window, with the night in it ---------- */
  const win = home.window;
  const wy = up(win.y);
  const wz = G.backZ;
  const night = new THREE.Mesh(
    new THREE.PlaneGeometry(win.width, win.height),
    // the night gives light too — a little, and blue — and lets the moon's through
    keep(lightSource("#ffffff", 1, { emissiveMap: nightTexture() })),
  );
  night.position.set(win.x, wy, wz - 34);
  scene.add(night);
  const reveal = (w: number, h: number, x: number, y: number) =>
    scene.add(mesh(new THREE.BoxGeometry(w, h, 34), timber, x, y, wz - 17));
  reveal(win.width + 36, 18, win.x, wy + win.height / 2 + 9);
  reveal(win.width + 36, 18, win.x, wy - win.height / 2 - 9);
  reveal(18, win.height, win.x - win.width / 2 - 9, wy);
  reveal(18, win.height, win.x + win.width / 2 + 9, wy);
  // glazing bars: four panes
  scene.add(mesh(new THREE.BoxGeometry(10, win.height, 10), timber, win.x, wy, wz - 20));
  scene.add(mesh(new THREE.BoxGeometry(win.width, 10, 10), timber, win.x, wy, wz - 20));
  // the sill
  scene.add(mesh(new THREE.BoxGeometry(win.width + 70, 14, 56), timber, win.x, wy - win.height / 2 - 16, wz + 22));

  // curtains on a rod, folded, hanging either side
  const rodY = wy + win.height / 2 + 46;
  const rod = mesh(new THREE.CylinderGeometry(4, 4, win.width + 330, 10), brass, win.x, rodY, wz + 34);
  rod.rotation.z = Math.PI / 2;
  scene.add(rod);
  const curtains: { geometry: THREE.PlaneGeometry; rest: Float32Array; phase: number }[] = [];
  for (const side of [-1, 1]) {
    const height = rodY - FLOOR - 24;
    const geometry = new THREE.PlaneGeometry(140, height, 28, 6);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // folds: a sine across the width, deepening toward the hem
      const x = pos.getX(i);
      const y = pos.getY(i);
      const depth = 9 + ((height / 2 - y) / height) * 6;
      pos.setZ(i, Math.sin((x / 140) * Math.PI * 6) * depth);
    }
    geometry.computeVertexNormals();
    const curtain = new THREE.Mesh(geometry, linen);
    curtain.position.set(win.x + side * (win.width / 2 + 95), rodY - height / 2, wz + 40);
    curtain.castShadow = true;
    curtain.receiveShadow = true;
    scene.add(curtain);
    curtains.push({ geometry, rest: (pos.array as Float32Array).slice(), phase: side });
  }

  /* Moonlight, coming in through the glass. The light is outside, behind
     the back wall; the wall is built around the window and casts a shadow,
     so what reaches the floor is the shape of the window. */
  const moon = new THREE.SpotLight(new THREE.Color("#a9c1ff"), 9_000_000, 7000, 0.26, 0.45, 2);
  moon.position.set(win.x + 380, wy + 470, wz - 900);
  moon.target.position.set(win.x - 260, FLOOR, wz + 720);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.bias = -0.0008;
  moon.shadow.camera.near = 200;
  moon.shadow.camera.far = 6000;
  scene.add(moon, moon.target);

  /* ---------- beams, panelling, the door ---------- */
  for (const z of [-1150, -540, 70]) {
    const beam = mesh(new THREE.BoxGeometry(G.roomX * 2, 34, 64), darkWood, 0, up(G.ceilY) - 17, z);
    scene.add(beam);
  }
  const length = { x: G.frontZ - G.backZ, z: G.roomX * 2 };
  const along = (h: number, d: number, y: number, inset: number) => {
    // left and right walls, then back and front
    for (const side of [-1, 1]) {
      scene.add(mesh(new THREE.BoxGeometry(d, h, length.x), timber, side * (G.roomX - inset), y, (G.frontZ + G.backZ) / 2));
    }
    scene.add(mesh(new THREE.BoxGeometry(length.z, h, d), timber, 0, y, G.backZ + inset));
    scene.add(mesh(new THREE.BoxGeometry(length.z, h, d), timber, 0, y, G.frontZ - inset));
  };
  along(150, 6, FLOOR + 75, 3); // wainscot
  along(12, 16, FLOOR + 154, 8); // chair rail
  along(26, 12, FLOOR + 13, 6); // skirting
  along(8, 10, FLOOR + 470, 5); // picture rail

  const door = home.door;
  const dz = G.frontZ - 10;
  scene.add(mesh(new THREE.BoxGeometry(door.width, door.height, 12), darkWood, door.x, FLOOR + door.height / 2, dz));
  for (const sx of [-1, 1]) {
    scene.add(mesh(new THREE.BoxGeometry(22, door.height + 22, 30), timber, door.x + sx * (door.width / 2 + 11), FLOOR + (door.height + 22) / 2, dz - 6));
  }
  scene.add(mesh(new THREE.BoxGeometry(door.width + 44, 22, 30), timber, door.x, FLOOR + door.height + 11, dz - 6));
  for (const [y, h] of [[0.72, 0.36], [0.28, 0.36]] as const) {
    for (const sx of [-1, 1]) {
      scene.add(mesh(new THREE.BoxGeometry(door.width * 0.34, door.height * h, 4), timber, door.x + sx * door.width * 0.22, FLOOR + door.height * y, dz - 8));
    }
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(8, 14, 10), brass);
  knob.position.set(door.x + door.width / 2 - 30, FLOOR + 200, dz - 14);
  scene.add(knob);

  /* ---------- a clock on the wall, telling the real time ----------
     Between the fireplace and the corner, under the picture rail. */
  const clock = new THREE.Group();
  clock.position.set(-G.roomX + 6, FLOOR + 400, -560);
  clock.rotation.y = Math.PI / 2;
  const backing = mesh(new THREE.CylinderGeometry(50, 50, 8, 48), darkWood, 0, 0, 4);
  backing.rotation.x = Math.PI / 2;
  clock.add(backing);
  const dial = new THREE.Mesh(
    new THREE.CircleGeometry(44, 48),
    keep(new THREE.MeshStandardMaterial({ map: clockFaceTexture(), roughness: 0.6 })),
  );
  dial.position.z = 8.5;
  dial.receiveShadow = true;
  clock.add(dial);
  const bezel = mesh(new THREE.TorusGeometry(46, 3.2, 10, 48), brass, 0, 0, 9);
  clock.add(bezel);
  /** a hand, pivoting at the centre: `tail` of it behind the pivot */
  const hand = (width: number, length: number, tail: number, z: number, material: THREE.Material) => {
    const geometry = new THREE.BoxGeometry(width, length + tail, 1.4);
    geometry.translate(0, (length - tail) / 2, 0);
    const h = new THREE.Mesh(geometry, material);
    h.position.z = z;
    h.castShadow = true;
    clock.add(h);
    return h;
  };
  const inkMat = keep(new THREE.MeshStandardMaterial({ color: "#1b120c", roughness: 0.5 }));
  const hourHand = hand(4.4, 23, 5, 10, inkMat);
  const minuteHand = hand(3, 34, 6, 11, inkMat);
  const secondHand = hand(1.2, 37, 9, 12, keep(new THREE.MeshStandardMaterial({ color: "#b2321f", roughness: 0.5 })));
  // with less motion asked for the time is still told, without the second hand going round
  secondHand.visible = !still;
  clock.add(mesh(new THREE.CylinderGeometry(2.6, 2.6, 4, 12), brass, 0, 0, 12.5).rotateX(Math.PI / 2));
  scene.add(clock);
  const tell = () => {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;
    /* A quartz movement: the second hand jumps, overshoots, and settles,
       all in the first tenth of a second. */
    const into = s % 1;
    const kick = into < 0.14 ? 1 + 2.4 * (into / 0.14 - 1) ** 3 + 1.4 * (into / 0.14 - 1) ** 2 : 1;
    secondHand.rotation.z = -((Math.floor(s) - 1 + kick) / 60) * Math.PI * 2;
    minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
    hourHand.rotation.z = -(h / 12) * Math.PI * 2;
  };
  tell();

  /* ---------- rugs ---------- */
  home.rugs.forEach((r, i) => {
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(r.width, r.depth),
      keep(
        new THREE.MeshStandardMaterial({
          map: i === 0 ? weaveTexture(p.rugA, p.rugB, [4, 4]) : weaveTexture(p.rugB, "#3a2a20", [2, 3]),
          roughness: 1,
        }),
      ),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(r.x, FLOOR + 1 + i * 0.5, r.z);
    rug.receiveShadow = true;
    scene.add(rug);
  });

  table.updateMatrixWorld(true);
  const anchors: HomeAnchors = {
    fire: fire.localToWorld(new THREE.Vector3(0, 34, back + 118)),
    fireAcross: new THREE.Vector3(1, 0, 0).applyQuaternion(fire.quaternion),
    fireOut: new THREE.Vector3(0, 0, 1).applyQuaternion(fire.quaternion),
    fireTop: FLOOR + 186,
    mug: table.localToWorld(new THREE.Vector3(tw / 2 - 26, 119 + 30, 30)),
    moon: moon.position.clone(),
    moonAt: moon.target.position.clone(),
    moonCone: [moon.angle, moon.angle * (1 - moon.penumbra)],
    // corner to corner round the glass: top left, top right, bottom right, bottom left
    window: [
      new THREE.Vector3(win.x - win.width / 2, wy + win.height / 2, wz),
      new THREE.Vector3(win.x + win.width / 2, wy + win.height / 2, wz),
      new THREE.Vector3(win.x + win.width / 2, wy - win.height / 2, wz),
      new THREE.Vector3(win.x - win.width / 2, wy - win.height / 2, wz),
    ],
  };

  const fireBase = fireLight.intensity;
  const lampBase = lamp.intensity;

  return {
    anchors,
    tick(t, dt) {
      tell();
      if (still) return;
      // a fire never burns the same way twice: sums of unrelated sines
      const flicker = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 13.7 + 1.3) * 0.3 + Math.sin(t * 4.3) * 0.2;
      fireLight.intensity = fireBase * (0.82 + 0.18 * flicker);
      candleFlame.scale.set(1, 1.8 + Math.sin(t * 11) * 0.25, 1);
      lamp.intensity = lampBase;
      // the curtains move a little, as if the window does not quite shut
      for (const c of curtains) {
        const pos = c.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < pos.count; i++) {
          const y = c.rest[i * 3 + 1]!;
          const sway = Math.max(0, -y) * 0.035 * Math.sin(t * 0.9 + c.phase + y * 0.01);
          arr[i * 3 + 2] = c.rest[i * 3 + 2]! + sway;
        }
        pos.needsUpdate = true;
      }
      void dt;
    },
  };
}
