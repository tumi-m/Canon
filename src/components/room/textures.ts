import * as THREE from "three";

/**
 * Materials, drawn at runtime.
 *
 * No image assets and no downloads: every texture here is painted once into an
 * OffscreenCanvas-shaped 2D context and uploaded to the GPU. That keeps the
 * room's whole cost in the JS bundle it already ships, and it means a venue
 * can retint its timber without shipping a second atlas.
 *
 * Each maker is memoised by its arguments — a room asks for the same plank
 * texture forty times, and uploading it forty times is forty times the VRAM.
 */

const cache = new Map<string, THREE.Texture>();

function memo(key: string, make: () => THREE.Texture): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  cache.set(key, made);
  return made;
}

function surface(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable — the room cannot draw its materials");
  return ctx;
}

function finish(ctx: CanvasRenderingContext2D, repeat: [number, number]): THREE.Texture {
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Deterministic noise, so a texture looks the same every time it is drawn. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Long-grain timber: streaks along one axis, knots, a darker seam per plank. */
export function woodTexture(base: string, repeat: [number, number] = [6, 6]): THREE.Texture {
  return memo(`wood:${base}:${repeat.join()}`, () => {
    const ctx = surface(512, 512);
    const r = rand(7);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);

    // grain: many thin, low-contrast strokes running the length of the board
    for (let i = 0; i < 900; i++) {
      const y = r() * 512;
      const len = 120 + r() * 380;
      const x = r() * 512;
      ctx.strokeStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`;
      ctx.lineWidth = 0.6 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 5, x + len * 0.7, y + (r() - 0.5) * 5, x + len, y);
      ctx.stroke();
    }
    // the odd knot
    for (let i = 0; i < 3; i++) {
      const x = r() * 512;
      const y = r() * 512;
      for (let k = 0; k < 7; k++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.1 - k * 0.012})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y, 3 + k * 3.5, 2 + k * 2, r() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // plank seams
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 128, 512, 2);
    ctx.fillStyle = "rgba(255,240,220,0.06)";
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 128 + 2, 512, 1);

    return finish(ctx, repeat);
  });
}

/** Plaster: fine isotropic tooth, no direction. */
export function plasterTexture(base: string, repeat: [number, number] = [4, 2]): THREE.Texture {
  return memo(`plaster:${base}:${repeat.join()}`, () => {
    const ctx = surface(512, 512);
    const r = rand(19);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    const img = ctx.getImageData(0, 0, 512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 26;
      img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
    }
    ctx.putImageData(img, 0, 0);
    return finish(ctx, repeat);
  });
}

/** Woven pile, for rugs and upholstery. */
export function weaveTexture(a: string, b: string, repeat: [number, number] = [8, 8]): THREE.Texture {
  return memo(`weave:${a}:${b}:${repeat.join()}`, () => {
    const ctx = surface(256, 256);
    const r = rand(31);
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = b;
    ctx.lineWidth = 2;
    for (let i = -256; i < 256; i += 6) {
      ctx.globalAlpha = 0.25 + r() * 0.3;
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const img = ctx.getImageData(0, 0, 256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 22;
      img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
    }
    ctx.putImageData(img, 0, 0);
    return finish(ctx, repeat);
  });
}

/**
 * A sleeve's front face: the artwork if we have any, otherwise the title set
 * on a coloured field. Drawn rather than composited so the text is legible at
 * the distance you actually stand from a shelf.
 */
export function coverTexture(opts: {
  title: string;
  runtime: string;
  provider: string;
  hue: number;
  changed: boolean;
  image?: HTMLImageElement | undefined;
}): THREE.Texture {
  const { title, runtime, provider, hue, changed, image } = opts;
  const ctx = surface(384, 512);

  if (image) {
    // cover-fit the thumbnail: youtube's 4:3 has letterbox bars to crop off
    const scale = Math.max(384 / image.width, 512 / image.height) * 1.34;
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (384 - w) / 2, (512 - h) / 2, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, 384, 512);
    g.addColorStop(0, `hsl(${hue} 46% 38%)`);
    g.addColorStop(1, `hsl(${(hue + 40) % 360} 38% 18%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 384, 512);
  }

  // a wash at the foot so the type always has something to sit on
  const shade = ctx.createLinearGradient(0, 250, 0, 512);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.88)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 250, 384, 262);

  // the red tier gets a border, the same signal the list and the wall use
  if (changed) {
    ctx.strokeStyle = "#c8402a";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 374, 502);
  }

  ctx.fillStyle = "#fff";
  ctx.font = "600 30px ui-monospace, monospace";
  ctx.textBaseline = "top";
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 336 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  // the block sits on the printed strip and grows upward, so a long title
  // takes room from the artwork rather than running off the bottom edge — and
  // its lines have to be laid out first to last, not last to first
  const shown = lines.slice(0, 4);
  const foot = 418;
  shown.forEach((l, i) => ctx.fillText(l, 24, foot - (shown.length - 1 - i) * 36));

  // the printed strip along the bottom edge
  ctx.fillStyle = "#efe4ca";
  ctx.fillRect(16, 462, 352, 34);
  ctx.fillStyle = "#2a2118";
  ctx.font = "500 17px ui-monospace, monospace";
  ctx.fillText(`${provider.toUpperCase()} · ${runtime}`.slice(0, 34), 26, 470);

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Drop every texture this module is holding. Called when the room unmounts. */
export function disposeTextures(): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}
