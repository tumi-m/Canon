import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import type { WebGLPathTracer } from "three-gpu-pathtracer";

/**
 * The darkroom: stand still and the room develops.
 *
 * Moving, the room is rasterised — lights and shadows worked out the way a
 * game works them out, fast and approximate. Stand still for a moment and a
 * path tracer takes over: rays from the eye, bounced round the room off every
 * surface they hit, the light that comes back averaged over hundreds of
 * frames. Soft shadows, light that bleeds colour off the rug onto the
 * sofa, the fire actually lighting the room. It fades in over the raster
 * frame as it resolves, the way a print comes up in the tray, and the first
 * step you take puts the raster frame back.
 *
 * The tracer is a few hundred kilobytes and only some machines can carry
 * it, so it is fetched the first time it is wanted, not with the room.
 */

/**
 * Something that gives light rather than taking it: a bulb, a flame, a
 * screen, the night through the window. To the rasteriser it is drawn at full
 * strength and blooms. To the path tracer it is a surface that emits, and one
 * that shadow rays pass through — a bulb is a sphere round its light, and an
 * opaque sphere round a light is a light that has been put out.
 */
export function lightSource(
  colour: THREE.ColorRepresentation,
  strength: number,
  extra: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(colour),
    emissiveIntensity: strength,
    roughness: 1,
    metalness: 0,
    toneMapped: false,
    ...extra,
  });
  return passesLight(material);
}

/** Let shadow rays through a material: a flame, a bulb, the glass of a window. */
export function passesLight<M extends THREE.Material>(material: M): M {
  // read by the path tracer per material; the rasteriser has its own per-mesh flag
  return Object.assign(material, { castShadow: false });
}

/** Where a frame comes from, when it does not come from the rasteriser. */
export type FrameSource = {
  /** draw this frame into `target`, linear and unclamped, before bloom and tone mapping */
  draw(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void;
  /** how much of the frame is the traced image, 0 → 1 — the rest is raster */
  readonly cover: number;
};

export type DarkroomState = "loading" | "ready" | "developing" | "developed" | "failed";

export type Darkroom = FrameSource & {
  readonly state: DarkroomState;
  /** full passes over the frame so far */
  readonly samples: number;
  /**
   * Take over the frame. False until the tracer has arrived — the room
   * should go on rasterising until it says yes.
   */
  develop(dt: number): boolean;
  /** you moved, or something in the room did: back to the raster frame */
  stop(): void;
  dispose(): void;
};

/** Enough passes for a print with no grain left worth the power to remove. */
export const FULL_EXPOSURE = 320;
/** passes before the trace starts to show through: fewer and it arrives as snow */
const FIRST_SHOW = 4;
/** seconds the print takes to come up over the raster frame */
const FADE = 0.7;

type Scene = {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** goes up whenever anything a still has to be retaken for changes */
  readonly version: number;
};

const fullScreen = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The trace, cleaned up at its own resolution before it is shown.
 *
 * A path that finds a bulb by bouncing into it is one sample in a thousand
 * carrying a thousand times the light: a single white pixel on a dark ceiling
 * that takes hundreds of passes to average away. A pixel brighter than every
 * one of its eight neighbours is not detail — detail is never one pixel wide
 * at this resolution — so it is brought down to the brightest of them. Then a
 * light blur that stops at edges takes the grain off the first few passes,
 * fading out as the passes add up and the grain goes on its own.
 */
const despeckleMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, soften: { value: 0.5 } },
    depthTest: false,
    depthWrite: false,
    vertexShader: fullScreen,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float soften;
      varying vec2 vUv;
      float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
        ivec2 size = textureSize(map, 0);
        ivec2 p = ivec2(vUv * vec2(size));
        vec3 centre = texelFetch(map, p, 0).rgb;
        float lc = luma(centre);
        float brightest = 0.0;
        vec3 sum = vec3(0.0);
        float weights = 0.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            vec3 c = texelFetch(map, clamp(p + ivec2(x, y), ivec2(0), size - 1), 0).rgb;
            float l = luma(c);
            brightest = max(brightest, l);
            // neighbours like this pixel count; ones across an edge do not
            float w = exp(-abs(l - lc) / (0.25 * lc + 0.02));
            sum += c * w;
            weights += w;
          }
        }
        if (lc > brightest) centre *= brightest / max(lc, 1e-6);
        vec3 near = weights > 0.0 ? sum / weights : centre;
        gl_FragColor = vec4(min(mix(centre, near, soften), vec3(24.0)), 1.0);
      }
    `,
  });

/** The cleaned trace, laid over the raster frame — filtered, so a trace below screen resolution is not blocky. */
const printMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, opacity: { value: 0 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: fullScreen,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        gl_FragColor = vec4(texture2D(map, vUv).rgb, opacity);
      }
    `,
  });

export function createDarkroom(room: Scene, onChange: () => void): Darkroom {
  let tracer: WebGLPathTracer | null = null;
  let state: DarkroomState = "loading";
  let disposed = false;
  /** the room's version the tracer last took in, or -1 for none */
  let taken = -1;
  let developing = false;
  let cover = 0;
  const despeckle = new FullScreenQuad(despeckleMaterial());
  const print = new FullScreenQuad(printMaterial());
  // half float filters in webgl2 everywhere; the tracer's own 32-bit buffers do not
  const clean = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  /** the pass count the clean copy was made at: a finished print is not cleaned again every frame */
  let cleaned = -1;
  const uniform = (quad: FullScreenQuad, name: string) => (quad.material as THREE.ShaderMaterial).uniforms[name]!;

  const set = (next: DarkroomState) => {
    if (state === next) return;
    state = next;
    onChange();
  };

  import("three-gpu-pathtracer")
    .then(({ WebGLPathTracer }) => {
      if (disposed) return;
      const t = new WebGLPathTracer(room.renderer);
      // the room decides when to develop and how to show it; the tracer only traces
      t.renderToCanvas = false;
      t.rasterizeScene = false;
      t.renderDelay = 0;
      t.minSamples = 0;
      t.dynamicLowRes = false;
      t.bounces = 5;
      /* transmissiveBounces stays at its default even though nothing here is
         glass. The tracer sizes its table of random numbers from the bounce
         counts, and with fewer, pixels reused the same numbers pass after
         pass: a maze of black that never filled in. */
      // glossy paths blur a little more with each bounce: far less noise for a sliver of sharpness
      t.filterGlossyFactor = 0.5;
      // every texture in the room goes into one array at this size
      t.textureSize.set(512, 512);
      const dense = (window.devicePixelRatio || 1) > 1.5;
      // a dense display is traced below its resolution, in more and smaller pieces a frame
      t.renderScale = dense ? 0.6 : 1;
      t.tiles.set(dense ? 3 : 2, dense ? 3 : 2);
      tracer = t;
      set("ready");
    })
    .catch(() => set("failed"));

  return {
    get state() {
      return state;
    },
    get samples() {
      return tracer?.samples ?? 0;
    },
    get cover() {
      return cover;
    },
    develop(dt) {
      if (!tracer || state === "failed") return false;
      if (!developing) {
        try {
          /* Taking the room in means baking every mesh into one buffer and
             building a tree over it. That is done once; after that only what
             moved is re-baked, and the tree is refitted rather than rebuilt. */
          if (taken !== room.version) {
            tracer.setScene(room.scene, room.camera);
            taken = room.version;
          } else {
            tracer.updateCamera();
          }
        } catch {
          set("failed");
          return false;
        }
        developing = true;
        cover = 0;
        tracer.pausePathTracing = false;
        set("developing");
      }

      tracer.renderSample();
      if (tracer.samples >= FIRST_SHOW) cover = Math.min(1, cover + dt / FADE);
      if (tracer.samples >= FULL_EXPOSURE && !tracer.pausePathTracing) {
        // fully exposed: stop spending power on a picture that has stopped changing
        tracer.pausePathTracing = true;
        set("developed");
      }
      return true;
    },
    draw(renderer, target) {
      renderer.setRenderTarget(target);
      // until the print covers the frame, the raster frame is underneath it
      if (cover < 1) {
        renderer.clear();
        renderer.render(room.scene, room.camera);
      }
      if (cover > 0 && tracer) {
        const traced = tracer.target;
        if (cleaned !== tracer.samples || clean.width !== traced.width || clean.height !== traced.height) {
          clean.setSize(traced.width, traced.height);
          uniform(despeckle, "map").value = traced.texture;
          uniform(despeckle, "soften").value = Math.min(0.6, 3 / Math.max(1, tracer.samples));
          renderer.setRenderTarget(clean);
          despeckle.render(renderer);
          renderer.setRenderTarget(target);
          cleaned = tracer.samples;
        }
        uniform(print, "map").value = clean.texture;
        uniform(print, "opacity").value = cover;
        const clear = renderer.autoClear;
        renderer.autoClear = false;
        print.material.blending = cover < 1 ? THREE.NormalBlending : THREE.NoBlending;
        print.render(renderer);
        renderer.autoClear = clear;
      }
    },
    stop() {
      if (!developing) return;
      developing = false;
      cover = 0;
      cleaned = -1;
      tracer?.reset();
      if (state !== "failed") set("ready");
    },
    dispose() {
      disposed = true;
      tracer?.dispose();
      tracer = null;
      for (const quad of [despeckle, print]) {
        quad.dispose();
        quad.material.dispose();
      }
      clean.dispose();
    },
  };
}
