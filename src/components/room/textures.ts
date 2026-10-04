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

function finish(ctx: CanvasRenderingContext2D): THREE.Texture {
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * The same painting at a different tiling. A clone shares its source image,
 * so three.js uploads the pixels once however many repeats ask for it — the
 * floor and a shelf in the same timber used to paint and upload the grain
 * twice, and painting grain is most of what the room does before first frame.
 */
function tiled(painted: THREE.Texture, repeat: [number, number]): THREE.Texture {
  return memo(`${painted.uuid}:${repeat.join()}`, () => {
    const texture = painted.clone();
    texture.repeat.set(repeat[0], repeat[1]);
    return texture;
  });
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
  return tiled(woodGrain(base), repeat);
}

function woodGrain(base: string): THREE.Texture {
  return memo(`wood:${base}`, () => {
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

    return finish(ctx);
  });
}

/** Plaster: fine isotropic tooth, no direction. */
export function plasterTexture(base: string, repeat: [number, number] = [4, 2]): THREE.Texture {
  return tiled(plaster(base), repeat);
}

function plaster(base: string): THREE.Texture {
  return memo(`plaster:${base}`, () => {
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
    return finish(ctx);
  });
}

/** Woven pile, for rugs and upholstery. */
export function weaveTexture(a: string, b: string, repeat: [number, number] = [8, 8]): THREE.Texture {
  return tiled(weave(a, b), repeat);
}

function weave(a: string, b: string): THREE.Texture {
  return memo(`weave:${a}:${b}`, () => {
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
    return finish(ctx);
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

/** Lines of type set on a screen or a plaque, centred, top to bottom. */
type Line = { text: string; size: number; colour: string; gap?: number; font?: "mono" | "serif" };

function setLines(ctx: CanvasRenderingContext2D, lines: readonly Line[], width: number, height: number) {
  const total = lines.reduce((h, l) => h + l.size * 1.25 + (l.gap ?? 0), 0);
  let y = (height - total) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const line of lines) {
    y += line.gap ?? 0;
    ctx.fillStyle = line.colour;
    ctx.font =
      line.font === "serif"
        ? `400 ${line.size}px Georgia, serif`
        : `500 ${line.size}px ui-monospace, monospace`;
    ctx.fillText(line.text, width / 2, y, width - 60);
    y += line.size * 1.25;
  }
}

/**
 * The set's glass when there is no picture on it: dark, with the faint
 * reflection a switched-off screen actually has, and a line of type saying
 * what it is for. A black rectangle read as a hole in the wall.
 */
export function screenTexture(lines: readonly Line[], lit: boolean): THREE.Texture {
  const w = 1024;
  const h = 576;
  const ctx = surface(w, h);
  const glass = ctx.createLinearGradient(0, 0, w, h);
  glass.addColorStop(0, lit ? "#10231c" : "#0d1110");
  glass.addColorStop(0.5, lit ? "#07130f" : "#070908");
  glass.addColorStop(1, lit ? "#0b1a15" : "#0a0c0b");
  ctx.fillStyle = glass;
  ctx.fillRect(0, 0, w, h);
  // the window-shaped sheen a dark screen picks up from the room
  const sheen = ctx.createLinearGradient(0, 0, w * 0.6, h);
  sheen.addColorStop(0, "rgba(255,240,220,0.07)");
  sheen.addColorStop(0.35, "rgba(255,240,220,0.02)");
  sheen.addColorStop(0.36, "rgba(255,240,220,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  if (lit) {
    // scanlines, faintly
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }
  setLines(ctx, lines, w, h);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The capsule's face: a brass plate engraved with what it is, and a wax seal.
 * Without it the capsule was a pale panel nobody would guess was anything.
 */
export function plaqueTexture(timber: string): THREE.Texture {
  const w = 512;
  const h = 640;
  const ctx = surface(w, h);
  ctx.fillStyle = timber;
  ctx.fillRect(0, 0, w, h);
  // grain, lightly, so the face is the same wood as the rest of the box
  const r = rand(53);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
    ctx.lineWidth = 0.8 + r();
    const x = r() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (r() - 0.5) * 20, h);
    ctx.stroke();
  }
  // the brass plate
  const plate = ctx.createLinearGradient(0, 150, 0, 330);
  plate.addColorStop(0, "#e2bd72");
  plate.addColorStop(0.5, "#b88a3e");
  plate.addColorStop(1, "#8a6326");
  ctx.fillStyle = plate;
  ctx.fillRect(70, 150, w - 140, 180);
  ctx.strokeStyle = "rgba(60,36,8,0.7)";
  ctx.lineWidth = 3;
  ctx.strokeRect(80, 160, w - 160, 160);
  ctx.save();
  ctx.translate(0, 150);
  setLines(
    ctx,
    [
      { text: "THE CAPSULE", size: 40, colour: "#3d2708" },
      { text: "SEALED UNTIL ITS DATE", size: 18, colour: "#4a3010", gap: 10 },
    ],
    w,
    180,
  );
  ctx.restore();
  // the seal
  const cx = w / 2;
  const cy = 450;
  const wax = ctx.createRadialGradient(cx - 14, cy - 16, 6, cx, cy, 62);
  wax.addColorStop(0, "#e2553d");
  wax.addColorStop(0.6, "#b3301c");
  wax.addColorStop(1, "#6e170b");
  ctx.fillStyle = wax;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const rad = 58 + (i % 2 ? 4 : -2) + r() * 3;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,210,190,0.55)";
  ctx.font = "600 44px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✦", cx, cy + 2);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * The name board under a shelf: which shelf it is, and that you can add to
 * it. The shelves had no names in the room at all — only in the hud.
 */
export function signTexture(name: string, timber: string): THREE.Texture {
  const w = 1024;
  const h = 150;
  const ctx = surface(w, h);
  ctx.fillStyle = timber;
  ctx.fillRect(0, 0, w, h);
  // a painted board: a lighter field inside a darker edge
  ctx.fillStyle = "rgba(255,240,215,0.1)";
  ctx.fillRect(8, 8, w - 16, h - 16);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  setLines(
    ctx,
    [
      { text: name, size: 50, colour: "#f3e3c3", font: "serif" },
      { text: "+ add something here", size: 26, colour: "#ff9a7a", gap: 4 },
    ],
    w,
    h,
  );
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * The noticeboard by the door: cork, a pinned card, and what to do with it.
 */
export function boardTexture(): THREE.Texture {
  const w = 640;
  const h = 470;
  const ctx = surface(w, h);
  // cork
  ctx.fillStyle = "#9c7448";
  ctx.fillRect(0, 0, w, h);
  const r = rand(71);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${r() > 0.5 ? "60,36,14" : "220,180,120"},${0.08 + r() * 0.12})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  // the card
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.03);
  ctx.fillStyle = "#f6ecd6";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillRect(-230, -160, 460, 320);
  ctx.shadowColor = "transparent";
  ctx.translate(-230, -160);
  setLines(
    ctx,
    [
      { text: "add something", size: 48, colour: "#2a2118", font: "serif" },
      { text: "to the shelves", size: 48, colour: "#2a2118", font: "serif" },
      { text: "a video · a film · a record · an essay", size: 20, colour: "#6b5a44", gap: 18 },
      { text: "E  or tap", size: 24, colour: "#c8402a", gap: 22 },
    ],
    460,
    320,
  );
  ctx.restore();
  // pins
  for (const [x, y] of [
    [w / 2 - 200, h / 2 - 140],
    [w / 2 + 200, h / 2 - 150],
  ] as const) {
    ctx.fillStyle = "#c8402a";
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Old brick, for the fireplace: soft-edged courses, mortar, a little soot. */
export function brickTexture(): THREE.Texture {
  return memo("brick", () => {
    const ctx = surface(512, 512);
    const r = rand(83);
    ctx.fillStyle = "#3a2a22";
    ctx.fillRect(0, 0, 512, 512);
    const rows = 12;
    const h = 512 / rows;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? 0 : 32;
      for (let x = -64 + offset; x < 512; x += 64) {
        const tone = 0.75 + r() * 0.35;
        ctx.fillStyle = `rgb(${Math.round(128 * tone)},${Math.round(62 * tone)},${Math.round(46 * tone)})`;
        ctx.fillRect(x + 2, row * h + 2, 60, h - 4);
      }
    }
    // soot, heavier towards the middle where the fire is
    const soot = ctx.createRadialGradient(256, 380, 20, 256, 380, 300);
    soot.addColorStop(0, "rgba(10,6,4,0.55)");
    soot.addColorStop(1, "rgba(10,6,4,0)");
    ctx.fillStyle = soot;
    ctx.fillRect(0, 0, 512, 512);
    return finish(ctx);
  });
}

/**
 * Wallpaper: a quiet stripe with a small printed motif, in the wall's colour.
 * Plaster on its own read as a showroom; this reads as somebody's house.
 */
export function wallpaperTexture(base: string, repeat: [number, number]): THREE.Texture {
  return tiled(
    memo(`paper:${base}`, () => {
      const ctx = surface(256, 256);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "rgba(255,235,205,0.06)";
      for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 30, 256);
      ctx.fillStyle = "rgba(255,230,190,0.13)";
      for (let y = 32; y < 256; y += 64) {
        for (let x = 15; x < 256; x += 64) {
          ctx.beginPath();
          ctx.moveTo(x, y - 7);
          ctx.lineTo(x + 5, y);
          ctx.lineTo(x, y + 7);
          ctx.lineTo(x - 5, y);
          ctx.closePath();
          ctx.fill();
        }
      }
      const r = rand(101);
      const img = ctx.getImageData(0, 0, 256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (r() - 0.5) * 12;
        img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
        img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
        img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
      }
      ctx.putImageData(img, 0, 0);
      return finish(ctx);
    }),
    repeat,
  );
}

/** The night through the window: deep blue, a few stars, the moon, a roofline. */
export function nightTexture(): THREE.Texture {
  return memo("night", () => {
    const ctx = surface(512, 512);
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, "#0b1430");
    sky.addColorStop(0.6, "#1d2f5c");
    sky.addColorStop(1, "#3a4c78");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 512);
    const r = rand(17);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
      const s = r() < 0.15 ? 2 : 1;
      ctx.fillRect(r() * 512, r() * 320, s, s);
    }
    const moon = ctx.createRadialGradient(360, 130, 0, 360, 130, 120);
    moon.addColorStop(0, "rgba(255,250,230,1)");
    moon.addColorStop(0.25, "rgba(255,250,230,0.95)");
    moon.addColorStop(0.27, "rgba(200,215,255,0.35)");
    moon.addColorStop(1, "rgba(200,215,255,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, 512, 512);
    // the houses across the road, with a lit window or two
    ctx.fillStyle = "#070a14";
    ctx.beginPath();
    ctx.moveTo(0, 430);
    for (const [x, y] of [[60, 400], [130, 420], [180, 380], [260, 395], [330, 360], [400, 410], [470, 390], [512, 405]] as const) {
      ctx.lineTo(x, y);
    }
    ctx.lineTo(512, 512);
    ctx.lineTo(0, 512);
    ctx.fill();
    ctx.fillStyle = "rgba(255,200,120,0.85)";
    ctx.fillRect(200, 430, 10, 12);
    ctx.fillRect(350, 420, 9, 11);
    const texture = new THREE.CanvasTexture(ctx.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

/** A leaf, with alpha: midrib, veins, a darker edge. Shared by every plant. */
export function leafTexture(): THREE.Texture {
  return memo("leaf", () => {
    const ctx = surface(128, 256);
    ctx.clearRect(0, 0, 128, 256);
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, "#2f5d2a");
    g.addColorStop(0.5, "#4f8a3a");
    g.addColorStop(1, "#2f5d2a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(64, 4);
    ctx.bezierCurveTo(124, 60, 120, 190, 64, 252);
    ctx.bezierCurveTo(8, 190, 4, 60, 64, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(200,235,170,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(64, 8);
    ctx.lineTo(64, 248);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let y = 40; y < 230; y += 24) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(24, y - 18);
      ctx.moveTo(64, y);
      ctx.lineTo(104, y - 18);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(ctx.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}
