import * as THREE from "three";
import { G, hash, type World } from "./world";

/**
 * The air in the room: dust in the lamplight, the moon's beam and the motes
 * turning in it, embers going up the chimney, steam off a mug, the lines of a
 * picture on a tube.
 *
 * None of it is solid, so none of it belongs to the path tracer — and none of
 * it should stop when the tracer takes over. It lives on a layer of its own
 * and is drawn after the frame, whichever frame that is, so a still that has
 * developed into a photograph still has steam rising off the mug in it.
 *
 * Drawn after the frame means drawn without the frame's depth buffer, so
 * every piece tests itself against the room's depth by hand. Done by hand it
 * can be done softly: a mote fades as it nears a surface instead of being
 * cut off by it, and the beam meets the floor without a seam.
 */

/** The layer the air is drawn on. Layer 0 is the room. */
export const AIR = 1;

/** world.ts is +y down; three.js is +y up. See scene.ts. */
const up = (worldY: number) => -worldY;

/** Where the home's warm and moving things are, in world space. */
export type HomeAnchors = {
  /** the base of the flames */
  readonly fire: THREE.Vector3;
  /** along the firebox's width, and out of it into the room */
  readonly fireAcross: THREE.Vector3;
  readonly fireOut: THREE.Vector3;
  /** world y of the lintel: where the chimney takes the embers */
  readonly fireTop: number;
  /** the rim of the mug on the coffee table */
  readonly mug: THREE.Vector3;
  /** the moon, where it shines, and the cone it shines in: outer and inner half-angles */
  readonly moon: THREE.Vector3;
  readonly moonAt: THREE.Vector3;
  readonly moonCone: readonly [number, number];
  /** the four corners of the window it shines through */
  readonly window: readonly THREE.Vector3[];
};

export type Air = {
  readonly group: THREE.Group;
  tick(t: number, dt: number): void;
  /**
   * The room's depth, for testing against by hand — or null, when the air is
   * drawn in the same pass as the room and the depth buffer does it.
   */
  setDepth(depth: THREE.DepthTexture | null, width: number, height: number): void;
  /** the set's picture is on: lines roll down it */
  setScreen(on: boolean): void;
  dispose(): void;
};

/** A soft round dot. */
function dotSprite(): THREE.Texture {
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

/** The test against the room's depth, shared by everything in the air. */
const depthTest = /* glsl */ `
  uniform sampler2D roomDepth;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  float viewZ(float depth) {
    float z = depth * 2.0 - 1.0;
    return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
  }
  /** 1 well in front of the room, 0 behind it, and soft over \`soft\` units between */
  float inFront(float distance, float soft) {
    #ifdef SOFT
      float room = viewZ(texture2D(roomDepth, gl_FragCoord.xy / resolution).x);
      return clamp((room - distance) / soft, 0.0, 1.0);
    #else
      return 1.0;
    #endif
  }
`;

/** additive, premultiplied: what a glow does to whatever is behind it */
const glowBlending = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquation: THREE.AddEquation,
} as const;

type Shared = Record<string, THREE.IUniform>;

function particleMaterial(shared: Shared, sprite: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, map: { value: sprite } },
    ...glowBlending,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec4 tint;
      uniform float pointScale;
      varying vec4 vTint;
      varying float vDistance;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        // the same attenuation as three's own points: size in world units at the view's scale
        gl_PointSize = min(size * pointScale / -view.z, 40.0);
        // a mote on the end of your nose is a blur across the room: it goes before it gets there
        vTint = vec4(tint.rgb, tint.a * smoothstep(40.0, 160.0, -view.z));
        vDistance = -view.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec4 vTint;
      varying float vDistance;
      ${depthTest}
      void main() {
        float a = texture2D(map, gl_PointCoord).a * vTint.a * inFront(vDistance, 30.0);
        if (a < 0.002) discard;
        gl_FragColor = vec4(vTint.rgb * a, a);
      }
    `,
  });
}

/** A cloud of points the tick moves about: position, size and tint per point. */
function cloud(count: number, material: THREE.ShaderMaterial) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const tints = new Float32Array(count * 4);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const size = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.BufferAttribute(tints, 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("size", size);
  geometry.setAttribute("tint", tint);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.layers.set(AIR);
  return {
    points,
    positions,
    sizes,
    tints,
    flush() {
      position.needsUpdate = true;
      size.needsUpdate = true;
      tint.needsUpdate = true;
    },
  };
}

/** Deterministic, so the room's air is the same air every visit. */
function seeded(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 0xffffffff;
  };
}

export function buildAir(options: {
  world: World;
  light: THREE.Color;
  camera: THREE.PerspectiveCamera;
  anchors: HomeAnchors | null;
  /** where the set's screen is: its centre, its facing, its size */
  screen: { position: THREE.Vector3; quaternion: THREE.Quaternion; width: number; height: number };
  still: boolean;
}): Air {
  const { world, light, camera, anchors, screen, still } = options;
  const group = new THREE.Group();
  group.name = "the air";
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T): T => {
    disposables.push(thing);
    return thing;
  };
  const sprite = keep(dotSprite());
  const shared: Shared = {
    roomDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: camera.near },
    cameraFar: { value: camera.far },
    pointScale: { value: 360 },
    time: { value: 0 },
  };
  const materials: THREE.ShaderMaterial[] = [];
  const material = (m: THREE.ShaderMaterial) => {
    materials.push(keep(m));
    return m;
  };
  const random = seeded(0x9e3779b9);
  const ticks: ((t: number, dt: number) => void)[] = [];

  /* ---------- dust in the lamplight ----------
     A few hundred motes drifting through the light, gathered under the
     lamps where lit dust shows. Most of what makes still air read as air. */
  {
    const MOTES = 320;
    const dust = cloud(MOTES, material(particleMaterial(shared, sprite)));
    const rest = new Float32Array(MOTES * 3);
    const drift = new Float32Array(MOTES * 4);
    for (let i = 0; i < MOTES; i++) {
      const lamp = world.lamps[i % Math.max(1, world.lamps.length)];
      const near = random() < 0.8 && lamp;
      rest[i * 3] = near ? lamp.x + (random() - 0.5) * 900 : (random() - 0.5) * G.roomX * 1.8;
      rest[i * 3 + 1] = up(G.floorY) + 40 + random() * (G.floorY - G.ceilY - 140);
      rest[i * 3 + 2] = near ? lamp.z + (random() - 0.5) * 900 : G.backZ + random() * (G.frontZ - G.backZ);
      drift[i * 4] = random() * Math.PI * 2;
      drift[i * 4 + 1] = 0.12 + random() * 0.3;
      drift[i * 4 + 2] = 18 + random() * 40;
      // how fast it catches the light and loses it again
      drift[i * 4 + 3] = 0.4 + random() * 1.2;
      dust.sizes[i] = 4 + random() * 2.5;
    }
    dust.positions.set(rest);
    const place = (t: number) => {
      for (let i = 0; i < MOTES; i++) {
        const phase = drift[i * 4]!;
        const a = t * drift[i * 4 + 1]! + phase;
        const reach = drift[i * 4 + 2]!;
        dust.positions[i * 3] = rest[i * 3]! + Math.sin(a) * reach;
        dust.positions[i * 3 + 1] = rest[i * 3 + 1]! + Math.sin(a * 0.7 + phase) * reach * 0.6;
        dust.positions[i * 3 + 2] = rest[i * 3 + 2]! + Math.cos(a * 0.9) * reach;
        // a mote turning catches the light and loses it
        const glint = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * drift[i * 4 + 3]! + phase * 3));
        dust.tints[i * 4] = light.r * 0.9;
        dust.tints[i * 4 + 1] = light.g * 0.9;
        dust.tints[i * 4 + 2] = light.b * 0.9;
        dust.tints[i * 4 + 3] = 0.5 * glint;
      }
      dust.flush();
    };
    place(0);
    group.add(dust.points);
    ticks.push((t) => place(t));
  }

  /* ---------- lines on the tube ----------
     The set in the room shows its picture through scanlines, with a bright
     band rolling slowly down it — the set the big screen is drawn as. */
  const lines = new THREE.Mesh(
    new THREE.PlaneGeometry(screen.width, screen.height),
    material(
      new THREE.ShaderMaterial({
        uniforms: { ...shared, rows: { value: 150 } },
        // multiply what is there: lines are darker, the band a touch brighter
        blending: THREE.CustomBlending,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        blendEquation: THREE.AddEquation,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying float vDistance;
          void main() {
            vUv = uv;
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            vDistance = -view.z;
            gl_Position = projectionMatrix * view;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float time;
          uniform float rows;
          varying vec2 vUv;
          varying float vDistance;
          ${depthTest}
          void main() {
            float line = 0.5 + 0.5 * sin(vUv.y * rows * 6.2831853);
            float band = smoothstep(0.12, 0.0, abs(fract(vUv.y + time * 0.11) - 0.5));
            float shade = 1.0 - 0.22 * line + 0.1 * band;
            // only where the screen is the nearest thing: a hand of 8 units for the glass
            float seen = inFront(vDistance - 8.0, 2.0);
            gl_FragColor = vec4(vec3(mix(1.0, shade, seen)), 1.0);
          }
        `,
      }),
    ),
  );
  lines.position.copy(screen.position);
  lines.quaternion.copy(screen.quaternion);
  lines.layers.set(AIR);
  lines.visible = false;
  group.add(lines);

  if (anchors) {
    /* ---------- the moon's beam ----------
       The volume the moonlight fills between the window and the floor:
       the window's four corners, carried away from the moon until they
       reach the boards. Brightest at the glass, gone by the floor. */
    const floor = up(G.floorY) + 1;
    const far = anchors.window.map((corner) => {
      const run = corner.clone().sub(anchors.moon);
      const t = (floor - anchors.moon.y) / run.y;
      return anchors.moon.clone().add(run.multiplyScalar(t));
    });
    const sides: number[] = [];
    const along: number[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const quad = [anchors.window[i]!, anchors.window[j]!, far[j]!, anchors.window[i]!, far[j]!, far[i]!];
      const at = [0, 0, 1, 0, 1, 1];
      quad.forEach((v, k) => {
        sides.push(v.x, v.y, v.z);
        along.push(at[k]!);
      });
    }
    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute("position", new THREE.Float32BufferAttribute(sides, 3));
    beamGeometry.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
    beamGeometry.computeVertexNormals();
    const beam = new THREE.Mesh(
      beamGeometry,
      material(
        new THREE.ShaderMaterial({
          uniforms: {
            ...shared,
            colour: { value: new THREE.Color("#a9c1ff") },
            moon: { value: anchors.moon },
            axis: { value: anchors.moonAt.clone().sub(anchors.moon).normalize() },
            outer: { value: Math.cos(anchors.moonCone[0]) },
            inner: { value: Math.cos(anchors.moonCone[1]) },
          },
          ...glowBlending,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          vertexShader: /* glsl */ `
            attribute float along;
            varying float vAlong;
            varying float vDistance;
            varying vec3 vNormal;
            varying vec3 vView;
            varying vec3 vWorld;
            void main() {
              vAlong = along;
              vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
              vec4 view = modelViewMatrix * vec4(position, 1.0);
              vDistance = -view.z;
              vNormal = normalize(normalMatrix * normal);
              vView = normalize(-view.xyz);
              gl_Position = projectionMatrix * view;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform vec3 colour;
            uniform float time;
            uniform vec3 moon;
            uniform vec3 axis;
            uniform float outer;
            uniform float inner;
            varying vec3 vWorld;
            varying float vAlong;
            varying float vDistance;
            varying vec3 vNormal;
            varying vec3 vView;
            ${depthTest}
            void main() {
              // seen edge-on a sheet of light is thicker; face-on, thinner
              float edge = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
              float fade = pow(1.0 - vAlong, 1.6);
              // only where the moon actually reaches: its cone, not the whole window's
              float lit = smoothstep(outer, inner, dot(normalize(vWorld - moon), axis));
              // the air in it is never quite still
              float breathe = 0.85 + 0.15 * sin(time * 0.5 + vAlong * 7.0);
              float a = 0.06 * fade * lit * (0.45 + 0.55 * edge) * breathe * inFront(vDistance, 120.0);
              gl_FragColor = vec4(colour * a, a);
            }
          `,
        }),
      ),
    );
    beam.layers.set(AIR);
    beam.frustumCulled = false;
    group.add(beam);

    /* ---------- motes in the beam ---------- */
    const MOON_MOTES = 120;
    const motes = cloud(MOON_MOTES, material(particleMaterial(shared, sprite)));
    const seat = new Float32Array(MOON_MOTES * 5);
    const corner = (u: number, v: number, list: readonly THREE.Vector3[]) =>
      list[0]!.clone()
        .lerp(list[1]!, u)
        .lerp(list[3]!.clone().lerp(list[2]!, u), v);
    for (let i = 0; i < MOON_MOTES; i++) {
      seat[i * 5] = random();
      seat[i * 5 + 1] = random();
      // most of them near the glass, where the beam is bright
      seat[i * 5 + 2] = random() ** 1.6 * 0.85;
      seat[i * 5 + 3] = random() * Math.PI * 2;
      seat[i * 5 + 4] = 0.05 + random() * 0.12;
      motes.sizes[i] = 2.5 + random() * 2;
    }
    const moonlight = new THREE.Color("#c4d4ff");
    const axis = anchors.moonAt.clone().sub(anchors.moon).normalize();
    const cosOuter = Math.cos(anchors.moonCone[0]);
    const cosInner = Math.cos(anchors.moonCone[1]);
    const scratch = new THREE.Vector3();
    const placeMotes = (t: number) => {
      for (let i = 0; i < MOON_MOTES; i++) {
        const phase = seat[i * 5 + 3]!;
        const speed = seat[i * 5 + 4]!;
        const u = (seat[i * 5]! + Math.sin(t * speed + phase) * 0.08 + 1) % 1;
        const v = (seat[i * 5 + 1]! + Math.cos(t * speed * 0.7 + phase) * 0.08 + 1) % 1;
        const s = seat[i * 5 + 2]!;
        const p = corner(u, v, anchors.window).lerp(corner(u, v, far), s);
        motes.positions[i * 3] = p.x;
        motes.positions[i * 3 + 1] = p.y + Math.sin(t * 0.3 + phase) * 6;
        motes.positions[i * 3 + 2] = p.z;
        // in the beam they glint; at its edges, and out of the moon's cone, they go out
        const toward = scratch.copy(p).sub(anchors.moon).normalize().dot(axis);
        const inCone = THREE.MathUtils.smoothstep(toward, cosOuter, cosInner);
        const inside = Math.min(u, 1 - u, v, 1 - v) * 6 * inCone;
        const glint = 0.5 + 0.5 * Math.sin(t * (0.6 + speed * 6) + phase * 5);
        const a = Math.min(1, inside) * (1 - s) * (0.25 + 0.75 * glint) * 0.9;
        motes.tints[i * 4] = moonlight.r;
        motes.tints[i * 4 + 1] = moonlight.g;
        motes.tints[i * 4 + 2] = moonlight.b;
        motes.tints[i * 4 + 3] = a;
      }
      motes.flush();
    };
    placeMotes(0);
    group.add(motes.points);
    ticks.push((t) => placeMotes(t));

    /* ---------- the fire ----------
       Tongues of flame, each a sheet that turns to face you, drawn from
       noise that climbs up it: wide and white-hot at the logs, narrowing,
       tearing and going red at the top, never the same twice. They are the
       picture of the fire; the fire's light is a real light in the room. */
    const tongues: [number, number, number, number][] = [
      // across the grate, height, width, seed
      [-56, 72, 46, 0.13],
      [-26, 100, 54, 0.71],
      [2, 118, 62, 0.37],
      [28, 92, 52, 0.92],
      [54, 66, 42, 0.55],
      [-8, 52, 96, 0.24],
    ];
    const centres: number[] = [];
    const corners: number[] = [];
    const extents: number[] = [];
    const seeds: number[] = [];
    const index: number[] = [];
    tongues.forEach(([across, height, width, seed], i) => {
      const centre = anchors.fire
        .clone()
        .addScaledVector(anchors.fireAcross, across)
        .addScaledVector(anchors.fireOut, (i % 2) * 6 - 3);
      for (const [cx, cy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const) {
        centres.push(centre.x, centre.y - 6, centre.z);
        corners.push(cx, cy);
        extents.push(width, height);
        seeds.push(seed);
      }
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const fireGeometry = new THREE.BufferGeometry();
    // three wants a position to draw from; the shader builds the real one
    fireGeometry.setAttribute("position", new THREE.Float32BufferAttribute(centres, 3));
    fireGeometry.setAttribute("centre", new THREE.Float32BufferAttribute(centres, 3));
    fireGeometry.setAttribute("corner", new THREE.Float32BufferAttribute(corners, 2));
    fireGeometry.setAttribute("extent", new THREE.Float32BufferAttribute(extents, 2));
    fireGeometry.setAttribute("seed", new THREE.Float32BufferAttribute(seeds, 1));
    fireGeometry.setIndex(index);
    const flames = new THREE.Mesh(
      fireGeometry,
      material(
        new THREE.ShaderMaterial({
          uniforms: { ...shared },
          ...glowBlending,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          vertexShader: /* glsl */ `
            attribute vec3 centre;
            attribute vec2 corner;
            attribute vec2 extent;
            attribute float seed;
            varying vec2 vUv;
            varying float vSeed;
            varying float vDistance;
            void main() {
              // turned about the upright to face the eye: a flame has no back
              vec3 toEye = cameraPosition - centre;
              toEye.y = 0.0;
              vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toEye + vec3(1e-4, 0.0, 0.0))));
              vec3 world = centre + right * corner.x * extent.x + vec3(0.0, corner.y * extent.y, 0.0);
              vUv = vec2(corner.x + 0.5, corner.y);
              vSeed = seed;
              vec4 view = viewMatrix * vec4(world, 1.0);
              vDistance = -view.z;
              gl_Position = projectionMatrix * view;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform float time;
            varying vec2 vUv;
            varying float vSeed;
            varying float vDistance;
            ${depthTest}
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float noise(vec2 p) {
              vec2 i = floor(p);
              vec2 f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              return mix(
                mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
                f.y
              );
            }
            float fbm(vec2 p) {
              float v = 0.0;
              float a = 0.5;
              for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.03;
                a *= 0.5;
              }
              return v;
            }
            void main() {
              vec2 uv = vUv;
              float t = time * 1.6 + vSeed * 11.0;
              float n = fbm(vec2(uv.x * 2.6 + vSeed * 5.0, uv.y * 2.2 - t));
              // the tongue sways, more the higher it goes
              float sway = (fbm(vec2(vSeed * 3.0, t * 0.6)) - 0.5) * 0.4 * uv.y;
              float x = abs((uv.x - 0.5 + sway) * 2.0);
              float width = (1.0 - uv.y) * 0.85 + 0.08;
              float body = smoothstep(width, width * 0.35, x);
              float heat = body * smoothstep(1.0, 0.15, uv.y + (n - 0.5) * 0.9) * (0.55 + 0.9 * n);
              heat *= smoothstep(0.0, 0.08, uv.y);
              vec3 c = mix(vec3(0.75, 0.12, 0.02), vec3(1.0, 0.42, 0.08), smoothstep(0.15, 0.55, heat));
              c = mix(c, vec3(1.0, 0.74, 0.36), smoothstep(0.7, 1.1, heat));
              float a = smoothstep(0.08, 0.5, heat) * inFront(vDistance, 20.0);
              // brighter than white only at its heart: enough to bloom, not to bleach
              gl_FragColor = vec4(c * a * (0.9 + 0.8 * smoothstep(0.7, 1.1, heat)), a);
            }
          `,
        }),
      ),
    );
    flames.layers.set(AIR);
    flames.frustumCulled = false;
    group.add(flames);

    /* ---------- embers ----------
       Lifted off the logs, going up into the chimney, a few of them
       wandering out over the hearth before they go out. */
    const EMBERS = 40;
    const embers = cloud(EMBERS, material(particleMaterial(shared, sprite)));
    const life = new Float32Array(EMBERS * 4);
    const rise = anchors.fireTop - anchors.fire.y;
    const spawn = (i: number, age: number) => {
      life[i * 4] = age;
      life[i * 4 + 1] = (random() - 0.5) * 120; // across the grate
      life[i * 4 + 2] = 1.4 + random() * 1.8; // seconds it lives
      life[i * 4 + 3] = random() < 0.2 ? 30 + random() * 60 : random() * 14; // how far out it strays
      embers.sizes[i] = 3.5 + random() * 3;
    };
    for (let i = 0; i < EMBERS; i++) spawn(i, random());
    const hot = new THREE.Color("#ffd27a");
    const cool = new THREE.Color("#ff5a1c");
    const glow = new THREE.Color();
    const at = new THREE.Vector3();
    const placeEmbers = (t: number, dt: number) => {
      for (let i = 0; i < EMBERS; i++) {
        let age = life[i * 4]! + dt / life[i * 4 + 2]!;
        if (age >= 1) {
          spawn(i, 0);
          age = 0;
        }
        life[i * 4] = age;
        const across = life[i * 4 + 1]! + Math.sin(t * 3 + i) * 8 * age;
        at.copy(anchors.fire)
          .addScaledVector(anchors.fireAcross, across)
          .addScaledVector(anchors.fireOut, life[i * 4 + 3]! * age);
        at.y += rise * (age * 1.15) ** 0.85;
        embers.positions[i * 3] = at.x;
        embers.positions[i * 3 + 1] = at.y;
        embers.positions[i * 3 + 2] = at.z;
        // white-yellow off the wood, cooling to red as it climbs
        glow.copy(hot).lerp(cool, age);
        const flare = Math.min(1, age * 10) * (1 - age) ** 1.5 * (0.7 + 0.3 * Math.sin(t * 20 + i * 7));
        // brighter than white: an ember is a light, and blooms like one
        embers.tints[i * 4] = glow.r * 3.5;
        embers.tints[i * 4 + 1] = glow.g * 3.5;
        embers.tints[i * 4 + 2] = glow.b * 3.5;
        embers.tints[i * 4 + 3] = flare;
      }
      embers.flush();
    };
    placeEmbers(0, 0);
    group.add(embers.points);
    ticks.push(placeEmbers);

    /* ---------- steam off the mug ---------- */
    const PUFFS = 12;
    const steam = cloud(PUFFS, material(particleMaterial(shared, sprite)));
    const puffs = new Float32Array(PUFFS * 2);
    for (let i = 0; i < PUFFS; i++) {
      puffs[i * 2] = i / PUFFS;
      puffs[i * 2 + 1] = random() * Math.PI * 2;
    }
    const placeSteam = (t: number, dt: number) => {
      for (let i = 0; i < PUFFS; i++) {
        let age = puffs[i * 2]! + dt / 3.6;
        if (age >= 1) {
          age -= 1;
          puffs[i * 2 + 1] = random() * Math.PI * 2;
        }
        puffs[i * 2] = age;
        const phase = puffs[i * 2 + 1]!;
        const curl = Math.sin(t * 1.3 + phase + age * 4) * (4 + age * 14);
        steam.positions[i * 3] = anchors.mug.x + curl;
        steam.positions[i * 3 + 1] = anchors.mug.y + 4 + age * 95;
        steam.positions[i * 3 + 2] = anchors.mug.z + Math.cos(t + phase) * age * 10;
        steam.sizes[i] = 14 + age * 42;
        // lit by the room rather than glowing: a warm grey, barely there
        const a = Math.sin(Math.PI * age) ** 1.5 * 0.1;
        steam.tints[i * 4] = light.r * 0.8;
        steam.tints[i * 4 + 1] = light.g * 0.78;
        steam.tints[i * 4 + 2] = light.b * 0.75;
        steam.tints[i * 4 + 3] = a;
      }
      steam.flush();
    };
    placeSteam(0, 0);
    group.add(steam.points);
    ticks.push(placeSteam);
  }

  // a seed from the room's own furniture, so two canons do not share one draught
  const offset = (hash(world.units.map((u) => u.key).join()) % 1000) / 10;

  return {
    group,
    tick(t, dt) {
      if (still) return;
      shared["time"]!.value = t + offset;
      for (const tick of ticks) tick(t + offset, dt);
    },
    setDepth(depth, width, height) {
      shared["roomDepth"]!.value = depth;
      (shared["resolution"]!.value as THREE.Vector2).set(width, height);
      // three's points scale: half the drawing buffer's height
      shared["pointScale"]!.value = height / 2;
      shared["cameraNear"]!.value = camera.near;
      shared["cameraFar"]!.value = camera.far;
      for (const m of materials) {
        const soft = depth !== null;
        if (!!m.defines["SOFT"] === soft) continue;
        if (soft) m.defines["SOFT"] = 1;
        else delete m.defines["SOFT"];
        // tested by hand against the room's depth, or by the depth buffer when drawn with it
        m.depthTest = !soft;
        m.needsUpdate = true;
      }
    },
    setScreen(on) {
      lines.visible = on;
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };
}
