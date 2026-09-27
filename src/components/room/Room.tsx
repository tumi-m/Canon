"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import type { Entry, Region } from "@/lib/schema";
import { WEIGHT_LABEL } from "@/lib/schema";
import { offersFor, regionName } from "@/lib/availability";
import { channelLabel, channelsFrom, embedUrl, surf, thumbnailFor, thumbnailForEntry } from "@/lib/youtube";
import { createRoomSound, STRIDE, type RoomSound } from "@/lib/roomSound";
import { artFor, buildWorld, collide, G, nearestUnit } from "./world";
import { buildStage, hitOf, type Hit, type Stage } from "./scene";
import { VENUES, venueById, type VenueId } from "./venues";
import styles from "./Room.module.css";

type Props = {
  entries: readonly Entry[];
  region: Region;
  services: readonly string[];
  displayName: string;
  venue: VenueId;
  onVenue: (venue: VenueId) => void;
  onLeave: () => void;
  onBrowseList: () => void;
  onCapsule: () => void;
};

/** Everything the frame loop mutates, kept out of React state. */
type Live = {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  bob: number;
  keys: Set<string>;
  /** which arrows are held: -1, 0 or 1 on each axis */
  look: { x: number; y: number };
  stick: { x: number; y: number };
  aim: Hit | null;
  raf: number;
  last: number;
  frame: number;
  stride: number;
  /** 1 → 0 over the walk in through the door */
  intro: number;
};

/** wasd walks. */
const KEYMAP: Record<string, string> = { w: "w", a: "a", s: "s", d: "d" };

/**
 * The arrows turn your head.
 *
 * They used to be a second set of walk keys, which left looking around
 * available only to a mouse — no pointer, no way to face anything, and a
 * reticle you cannot aim is a room you cannot use. Walking and looking are
 * different verbs and now have different keys.
 */
const LOOKMAP: Record<string, [number, number]> = {
  arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1],
};

/** degrees a second, held down */
const TURN = 108;

/** how close a shelf has to be before the badge says you are at it */
const NEAR_SHELF = 620;

/**
 * The room is portalled to <body> rather than rendered where it is mounted.
 * It has to be: making the rest of the page inert means walking body's
 * children, and a room nested inside <main> is *inside* the thing it needs to
 * switch off — so focus walks straight out of the den into the canon behind it.
 */
export default function Room(props: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  /* captured out here, because it has to be read before the scene mounts and
     moves focus to its own exit button */
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    const el = document.createElement("div");
    el.dataset.canonRoom = "";
    document.body.appendChild(el);
    setHost(el);
    return () => el.remove();
  }, []);

  if (!host) return null;
  return createPortal(<RoomScene {...props} host={host} opener={opener} />, host);
}

function RoomScene({
  entries, region, services, displayName, venue, onVenue,
  onLeave, onBrowseList, onCapsule, host, opener,
}: Props & { host: HTMLElement; opener: React.RefObject<HTMLElement | null> }) {
  const place = useMemo(() => venueById(venue), [venue]);
  const world = useMemo(() => buildWorld(entries, place.shelves), [entries, place]);
  const paid = useMemo(() => new Set(services), [services]);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const nubRef = useRef<HTMLElement>(null);
  const stageRef = useRef<Stage | null>(null);
  /** what the set in the room is showing, kept so a rebuilt room shows it too */
  const screenImage = useRef<HTMLImageElement | null>(null);

  const [at, setAt] = useState<string | null>(null);
  const [aimLabel, setAimLabel] = useState<{ title: string; hint: string } | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [theatre, setTheatre] = useState(false);
  /** the room is drawn on the gpu; say which of the three states it is in */
  const [gl, setGl] = useState<"loading" | "ready" | "failed">("loading");
  /** the curtain stays down while the room builds, then lifts rather than vanishing */
  const [curtainUp, setCurtainUp] = useState(false);
  useEffect(() => {
    if (gl === "loading") setCurtainUp(false);
  }, [gl]);

  const reduced = useRef(false);
  const paused = useRef(false);
  const touch = useRef(false);
  const live = useRef<Live>({
    x: 0, z: G.spawnZ, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0,
    keys: new Set(), look: { x: 0, y: 0 }, stick: { x: 0, y: 0 },
    aim: null, raf: 0, last: 0, frame: 0, stride: 0, intro: 1,
  });

  /* ---------- the television ---------- */
  const channels = useMemo(() => channelsFrom(entries), [entries]);
  const [tvOn, setTvOn] = useState(false);
  const [channel, setChannel] = useState(0);
  const [muted, setMuted] = useState(true);
  const playing = tvOn ? channels[channel] : undefined;

  /* ---------- room sound ---------- */
  const [audible, setAudible] = useState(false);
  const sound = useRef<RoomSound | null>(null);

  const toggleSound = useCallback(() => {
    setAudible((on) => {
      if (on) {
        sound.current?.close();
        sound.current = null;
        return false;
      }
      // must be built inside the gesture: browsers refuse otherwise
      sound.current = createRoomSound();
      return sound.current !== null;
    });
  }, []);

  useEffect(() => {
    sound.current?.duck(tvOn);
  }, [tvOn]);
  useEffect(() => () => sound.current?.close(), []);

  const tune = useCallback(
    (step: number) => {
      if (channels.length === 0) return;
      setTvOn(true);
      setChannel((c) => surf(channels, c, step));
      sound.current?.clack();
    },
    [channels],
  );

  const providerFor = useCallback(
    (entry: Entry) => offersFor(entry.work.id, region)[0]?.provider.name ?? "—",
    [region],
  );

  const activate = useCallback(
    (hit: Hit | null) => {
      if (!hit) return;
      if (hit.kind === "capsule") return onCapsule();
      if (hit.kind === "tv") {
        setTvOn(true);
        setTheatre(true);
        sound.current?.clack();
        return;
      }
      if (hit.entry !== null) {
        setOpened(hit.entry);
        setFlipped(false);
        sound.current?.pick();
      }
    },
    [onCapsule],
  );

  /* ---------- build the scene ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    touch.current = window.matchMedia("(pointer:coarse)").matches;
    setCoarse(touch.current);

    const L = live.current;

    const mount = (): (() => void) => {
      let stage: Stage;
      try {
        stage = buildStage(canvas, world, place, entries, providerFor, reduced.current);
      } catch {
        // no webgl, or the context was refused. the list is always there.
        setGl("failed");
        return () => {};
      }
      stageRef.current = stage;
      stage.setScreen(screenImage.current);

      /* A rebuild — a different building, a different region — happens around
         you. It used to walk you back to the door every time. */
      [L.x, L.z] = collide(L.x, L.z, world.boxes, world.bounds);

      // a driver reset or a backgrounded phone can take the gpu away mid-visit
      const lost = (e: Event) => {
        e.preventDefault();
        cancelAnimationFrame(L.raf);
        setGl("failed");
      };
      canvas.addEventListener("webglcontextlost", lost);

      // cap the pixel ratio: a 3x phone display is three times the pixels for
      // no visible gain in a room this dim
      const sharpest = Math.min(window.devicePixelRatio || 1, 2);
      /* Resolution follows the frame rate. A machine that cannot hold ~30fps
         at full resolution draws fewer pixels until it can, and earns them
         back once it is comfortably quick again. A slightly softer room is
         a far better trade than one that stutters every time you turn. */
      let dpr = sharpest;
      let pace = 1 / 60;
      let settle = 1.5;
      const fit = () => {
        stage.resize(window.innerWidth, window.innerHeight, dpr);
      };
      const adapt = (dt: number) => {
        pace += (dt - pace) * 0.08;
        settle -= dt;
        if (settle > 0) return;
        if (pace > 1 / 28 && dpr > 0.6) {
          dpr = Math.max(0.6, dpr * 0.75);
          fit();
          settle = 1;
        } else if (pace < 1 / 55 && dpr < sharpest) {
          dpr = Math.min(sharpest, dpr * 1.2);
          fit();
          settle = 3;
        }
      };
      fit();
      window.addEventListener("resize", fit);

      const raycaster = new THREE.Raycaster();
      /**
       * The reticle is a ring on the screen, not a mathematical point, so the
       * pick samples the area it actually covers: the centre plus its rim. One
       * ray can thread a seam between two touching cases and report nothing
       * while the crosshair is plainly sitting on artwork.
       */
      const RETICLE = 0.022; // in NDC, about the radius the ring is drawn at
      const probes = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(RETICLE, 0),
        new THREE.Vector2(-RETICLE, 0),
        new THREE.Vector2(0, RETICLE),
        new THREE.Vector2(0, -RETICLE),
      ];
      /** whatever the reticle covers, nearest first */
      const aimAt = (camera: THREE.Camera, targets: THREE.Object3D[]) => {
        let best: THREE.Intersection | null = null;
        for (const probe of probes) {
          raycaster.setFromCamera(probe, camera);
          const first = raycaster.intersectObjects(targets, true)[0];
          if (first && (!best || first.distance < best.distance)) best = first;
        }
        return best;
      };

      const step = (dt: number) => {
        // arrows first: where you are facing decides which way forward is
        if (L.look.x || L.look.y) {
          L.yaw += L.look.x * TURN * dt;
          L.pitch = Math.max(-42, Math.min(42, L.pitch + L.look.y * TURN * dt));
        }
        const f = (L.keys.has("w") ? 1 : 0) - (L.keys.has("s") ? 1 : 0) + L.stick.y;
        const r = (L.keys.has("d") ? 1 : 0) - (L.keys.has("a") ? 1 : 0) + L.stick.x;
        const yaw = (L.yaw * Math.PI) / 180;
        const ix = Math.sin(yaw) * f + Math.cos(yaw) * r;
        const iz = -Math.cos(yaw) * f + Math.sin(yaw) * r;
        const mag = Math.hypot(ix, iz);
        const speed = G.speed;
        const tx = mag ? (ix / mag) * speed : 0;
        const tz = mag ? (iz / mag) * speed : 0;
        const k = Math.min(1, dt * (reduced.current ? 40 : 9));
        L.vx += (tx - L.vx) * k;
        L.vz += (tz - L.vz) * k;
        const [nx, nz] = collide(L.x + L.vx * dt, L.z + L.vz * dt, world.boxes, world.bounds);
        L.x = nx;
        L.z = nz;

        const moving = Math.hypot(L.vx, L.vz);
        L.bob += moving * dt * 0.024;
        L.stride += moving * dt;
        if (L.stride > STRIDE) {
          L.stride = 0;
          sound.current?.step();
        }

        /* The way in: you arrive a few steps back, a little taller than you
           will stand once you are in, and settle onto your feet as the
           curtain lifts. Cubic ease-out, so it slows as it lands. */
        if (reduced.current) L.intro = 0;
        else if (L.intro > 0) L.intro = Math.max(0, L.intro - dt / 1.9);
        const arriving = L.intro * L.intro * L.intro;

        // world.ts measures +y down; the scene is built +y up (see scene.ts)
        const bob = reduced.current ? 0 : -Math.sin(L.bob) * 6;
        stage.camera.position.set(L.x, bob + arriving * 36, L.z + arriving * 210);
        stage.camera.rotation.set(0, 0, 0);
        stage.camera.rotateY((L.yaw * Math.PI) / -180);
        stage.camera.rotateX(((L.pitch - arriving * 5) * Math.PI) / 180);
        if (!reduced.current) stage.camera.rotateZ((Math.sin(L.bob * 0.5) * 0.45 * Math.PI) / 180);
      };

      const loop = (t: number) => {
        // behind the big screen the room is paused, not torn down
        if (paused.current) {
          L.last = t;
          L.raf = requestAnimationFrame(loop);
          return;
        }
        /* Clamp only the pathological gap — a backgrounded tab coming back —
           and let an honestly slow frame integrate at its real length. Capping
           at a tenth of a second meant anything under 10fps walked in slow
           motion, which is exactly the machine that can least afford it. */
        const dt = Math.min(0.25, (t - L.last) / 1000 || 0.016);
        L.last = t;
        adapt(dt);
        step(dt);

        // the reticle is a real ray now: no cones, no thresholds, no hysteresis
        if (++L.frame % 3 === 0) {
          // the camera is not in the scene graph, so nothing else refreshes it;
          // without this the ray is aimed a frame behind where you are looking
          stage.camera.updateMatrixWorld();
          const first = aimAt(stage.camera, stage.targets);
          const hit = first && first.distance < 1500 ? hitOf(first.object) : null;
          if (hit?.key !== L.aim?.key) {
            L.aim = hit ?? null;
            stage.highlight(hit && hit.kind === "sleeve" ? (first?.object ?? null) : null);
            if (!hit) setAimLabel(null);
            else
              setAimLabel({
                title: hit.label,
                hint:
                  hit.kind === "capsule"
                    ? "E · SEALED UNTIL ITS DATE"
                    : hit.kind === "tv"
                      ? "E · SIT DOWN AND WATCH"
                      : "E · TAKE IT OFF THE SHELF",
              });
          }
          /* what you are looking at beats what happens to be nearest: a small
             crate in the middle of the floor is closer to most of the room than
             the bookcase you are standing at reading. */
          const near = nearestUnit(world.units, L);
          const close = near && Math.hypot(near.fx - L.x, near.fz - L.z) < NEAR_SHELF;
          // across the room from everything, you are simply in the room
          setAt(L.aim?.shelf ?? (close ? near.label : null));
        }

        stage.tick(t / 1000, dt);
        stage.renderer.render(stage.scene, stage.camera);
        L.raf = requestAnimationFrame(loop);
      };

      L.last = performance.now();
      L.raf = requestAnimationFrame(loop);
      setGl("ready");

      return () => {
        cancelAnimationFrame(L.raf);
        window.removeEventListener("resize", fit);
        canvas.removeEventListener("webglcontextlost", lost);
        stage.dispose();
        stageRef.current = null;
      };
    };

    /* Painting the materials and compiling the shaders blocks the main thread
       for a second or two. Two frames' grace lets "letting you in" actually
       reach the screen first, instead of a click that appears to do nothing. */
    setGl("loading");
    let unmount: (() => void) | null = null;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        unmount = mount();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      unmount?.();
    };
  }, [world, place, entries, providerFor]);

  /* the big screen pauses the room; nothing you were holding stays held */
  useEffect(() => {
    paused.current = theatre;
    if (theatre) {
      live.current.keys.clear();
      live.current.look = { x: 0, y: 0 };
    }
  }, [theatre]);

  // the way out has focus from the moment you are in, not once the gpu is done
  useEffect(() => {
    exitRef.current?.focus({ preventScroll: true });
  }, []);

  /* the set shows the artwork of whatever is playing */
  useEffect(() => {
    if (!playing) {
      screenImage.current = null;
      stageRef.current?.setScreen(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      screenImage.current = image;
      stageRef.current?.setScreen(image);
    };
    image.src = thumbnailFor(playing.videoId);
    return () => {
      image.onload = null;
    };
  }, [playing]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const L = live.current;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      /* A focused control owns its own keys. Enter used to be taken for
         "take it off the shelf" everywhere, which meant a keyboard could not
         press the very button it had tabbed to. */
      const control =
        e.target instanceof Element && e.target.closest("button, a, select, input, textarea");
      if (control && (k === "enter" || k === " ")) return;
      // with a card in your hands, or the big screen up, you are not walking
      if ((opened !== null || theatre) && (KEYMAP[k] || LOOKMAP[k])) return;
      if (KEYMAP[k]) {
        L.keys.add(KEYMAP[k]!);
        e.preventDefault();
        return;
      }
      const look = LOOKMAP[k];
      if (look) {
        L.look.x = look[0] || L.look.x;
        L.look.y = look[1] || L.look.y;
        e.preventDefault();
        return;
      }
      if (k === "e" || k === "enter") {
        if (opened === null && !theatre) activate(L.aim);
        e.preventDefault();
        return;
      }
      if (k === "t") {
        setTvOn(true);
        setTheatre((on) => !on);
        e.preventDefault();
        return;
      }
      if (k === "]" || k === ".") return tune(1);
      if (k === "[" || k === ",") return tune(-1);
      if (k === "m") {
        setMuted((m) => !m);
        return;
      }
      if (k === "escape") {
        if (theatre) setTheatre(false);
        else if (opened !== null) setOpened(null);
        else if (document.pointerLockElement === rootRef.current) document.exitPointerLock();
        else onLeave();
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const k = KEYMAP[key];
      if (k) L.keys.delete(k);
      const look = LOOKMAP[key];
      if (look) {
        if (look[0]) L.look.x = 0;
        if (look[1]) L.look.y = 0;
      }
    };
    const blur = () => {
      L.keys.clear();
      L.look = { x: 0, y: 0 };
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [activate, onLeave, opened, theatre, tune]);

  /* ---------- looking around ---------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const L = live.current;
    const clamp = (p: number) => Math.max(-42, Math.min(42, p));
    const locked = () => document.pointerLockElement === root;

    const move = (e: MouseEvent) => {
      if (!locked()) return;
      L.yaw += e.movementX * 0.13;
      L.pitch = clamp(L.pitch - e.movementY * 0.104);
    };
    const onLock = () => root.classList.toggle(styles.look!, locked());

    let dragging = false;
    let px = 0;
    let py = 0;
    const pointerDown = (e: PointerEvent) => {
      if (locked()) return;
      dragging = true;
      px = e.clientX;
      py = e.clientY;
    };
    const pointerMove = (e: PointerEvent) => {
      if (!dragging || locked()) return;
      L.yaw += (e.clientX - px) * 0.22;
      L.pitch = clamp(L.pitch - (e.clientY - py) * 0.16);
      px = e.clientX;
      py = e.clientY;
    };
    const pointerUp = () => {
      dragging = false;
    };
    const click = () => {
      if (locked()) activate(L.aim);
      else if (!touch.current) root.requestPointerLock?.();
      else activate(L.aim); // on touch the reticle is the only pointer there is
    };

    document.addEventListener("mousemove", move);
    document.addEventListener("pointerlockchange", onLock);
    root.addEventListener("pointerdown", pointerDown);
    root.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    root.addEventListener("click", click);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("pointerlockchange", onLock);
      root.removeEventListener("pointerdown", pointerDown);
      root.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      root.removeEventListener("click", click);
      if (document.pointerLockElement === root) document.exitPointerLock();
    };
  }, [activate]);

  /* ---------- the page behind goes inert while you are in here ---------- */
  useEffect(() => {
    // read once, here: the ref is set before this scene mounts and never moves
    const back = opener.current;
    const others = Array.from(document.body.children).filter((child) => child !== host);
    for (const el of others) el.setAttribute("inert", "");
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const el of others) el.removeAttribute("inert");
      document.body.style.overflow = overflow;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [host, opener]);

  const hold = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      live.current.keys.add(key);
    },
    onPointerUp: () => live.current.keys.delete(key),
    onPointerLeave: () => live.current.keys.delete(key),
    onPointerCancel: () => live.current.keys.delete(key),
    /* a click from the keyboard (detail 0) has no pointer to hold down, so it
       takes one stride; these buttons used to do nothing at all from a key */
    onClick: (e: React.MouseEvent) => {
      if (e.detail !== 0) return;
      live.current.keys.add(key);
      window.setTimeout(() => live.current.keys.delete(key), 260);
    },
  });

  const stickHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.stopPropagation();
      const box = e.currentTarget.getBoundingClientRect();
      let dx = e.clientX - (box.left + box.width / 2);
      let dy = e.clientY - (box.top + box.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      if (d > 44) {
        dx = (dx / d) * 44;
        dy = (dy / d) * 44;
      }
      if (nubRef.current) nubRef.current.style.transform = `translate(${dx}px,${dy}px)`;
      live.current.stick = { x: dx / 44, y: -dy / 44 };
    },
    onPointerUp: () => {
      live.current.stick = { x: 0, y: 0 };
      if (nubRef.current) nubRef.current.style.transform = "";
    },
  };

  const openedEntry = opened === null ? undefined : entries[opened];
  const offers = openedEntry ? offersFor(openedEntry.work.id, region) : [];
  const openedThumb = openedEntry ? thumbnailForEntry(openedEntry) : undefined;

  return (
    <>
      <div
        ref={rootRef}
        className={styles.room}
        data-venue={place.id}
        role="application"
        aria-label={`${displayName}'s ${place.noun}`}
      >
        <canvas ref={canvasRef} className={styles.canvas} />
        {gl === "failed" ? (
          <div className={styles.noGl}>
            <p>this browser would not draw the room.</p>
            <button onClick={onBrowseList}>☰ read it as a list instead</button>
          </div>
        ) : null}
        {curtainUp || gl === "failed" ? null : (
          <div
            className={`${styles.curtain} ${gl === "ready" ? styles.curtainLift : ""}`}
            role={gl === "loading" ? "status" : undefined}
            aria-hidden={gl === "ready" ? true : undefined}
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && gl === "ready") setCurtainUp(true);
            }}
          >
            <span className={styles.curtainName}>
              {displayName}&apos;s {place.noun}
            </span>
            <span className={styles.curtainNote}>letting you in…</span>
          </div>
        )}
      </div>

      <div className={styles.dust} />
      <div className={styles.vign} />
      <div className={`${styles.retic} ${aimLabel ? styles.reticHot : ""}`} />
      {aimLabel ? (
        coarse ? (
          // on touch the label is the button: there is no E key to press
          <button
            key={aimLabel.title}
            className={`${styles.aimLabel} ${styles.aimTap}`}
            onClick={() => activate(live.current.aim)}
          >
            {aimLabel.title}
            <small>{aimLabel.hint.replace(/^E · /, "TAP · ")}</small>
          </button>
        ) : (
          <div key={aimLabel.title} className={styles.aimLabel}>
            {aimLabel.title}
            <small>{aimLabel.hint}</small>
          </div>
        )
      ) : null}

      <div className={styles.shelfList}>
        {world.units.map((unit) => (
          <div
            key={unit.key}
            className={`${styles.shelfRow} ${at === unit.label ? styles.shelfOn : ""}`}
          >
            <span className={styles.shelfDot} />
            {unit.label}
          </div>
        ))}
      </div>

      {coarse ? (
        <div className={styles.stick} {...stickHandlers}>
          <i ref={nubRef} />
        </div>
      ) : null}

      <div className={`${styles.hud} ${styles.hudTop}`}>
        <button ref={exitRef} className={styles.exit} onClick={onLeave}>
          ✕ let yourself out
          <span className={styles.exitHint}>OR PRESS ESC</span>
        </button>
        <span className={styles.hint}>
          {coarse
            ? "drag the pad to walk · drag the room to look · tap what you are aiming at"
            : "wasd to walk · arrows or mouse to look · e to take something off the shelf"}
        </span>
        <span className={styles.now}>
          {playing
            ? `${channelLabel(channel)} · ${playing.title}`
            : (at ?? `${displayName}'s ${place.noun}`)}
        </span>
      </div>

      <div
        className={`${styles.hud} ${styles.hudBot} ${coarse ? styles.hudTouch : ""}`}
        inert={opened !== null ? true : undefined}
      >
        {/* on a touch screen the stick walks you; the pad would sit under it */}
        {coarse ? null : (
          <div className={styles.pad} role="group" aria-label="walk">
            <button aria-label="step left" title="step left (a)" {...hold("a")}>◀</button>
            <button aria-label="step back" title="step back (s)" {...hold("s")}>▼</button>
            <button aria-label="step forward" title="step forward (w)" {...hold("w")}>▲</button>
            <button aria-label="step right" title="step right (d)" {...hold("d")}>▶</button>
          </div>
        )}
        <div className={styles.group} role="group" aria-label="the television">
          <button
            onClick={() => {
              setTvOn(true);
              setTheatre(true);
            }}
            title="watch full size (t)"
          >
            ▶ watch
          </button>
          <button onClick={() => setTvOn((on) => !on)} title="the set in the room" aria-pressed={tvOn}>
            {tvOn ? "◼ set off" : "◻ set on"}
          </button>
          {tvOn && channels.length > 0 ? (
            <>
              <button onClick={() => tune(-1)} aria-label="previous channel" title="previous channel ([)">
                ⏮
              </button>
              <button onClick={() => tune(1)} aria-label="next channel" title="next channel (])">
                ⏭
              </button>
              <button onClick={() => setMuted((m) => !m)} title="mute (m)" aria-pressed={!muted}>
                {muted ? "🔇 unmute" : "🔊 mute"}
              </button>
            </>
          ) : null}
        </div>
        <div className={styles.group}>
          <button
            onClick={toggleSound}
            title="room sound — footsteps, not a soundtrack"
            aria-pressed={audible}
          >
            {audible ? "◉ sound" : "○ sound"}
          </button>
          <label className={styles.venuePick}>
            <span className={styles.venueLabel}>where</span>
            <select
              value={place.id}
              onChange={(e) => onVenue(e.target.value as VenueId)}
              aria-label="where you keep it"
            >
              {VENUES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={onBrowseList}>☰ read it as a list</button>
        </div>
      </div>

      {theatre && playing ? (
        <div
          className={styles.theatre}
          role="dialog"
          aria-modal="true"
          aria-label={`watching ${playing.title}`}
        >
          <div className={styles.theatreScreen}>
            {/* full size, and with its own controls: this is a screen you are
                watching, not a prop in a room, so YouTube's chrome belongs to
                the viewer here */}
            <iframe
              key={`${playing.videoId}:${muted ? "m" : "s"}:big`}
              src={embedUrl(playing.videoId, { muted })}
              title={playing.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
          <p className={styles.theatreTitle}>
            {channelLabel(channel)} · {playing.title}
          </p>
          <div className={styles.theatreBar}>
            <button onClick={() => tune(-1)}>⏮ previous</button>
            <button onClick={() => tune(1)}>⏭ next</button>
            <button onClick={() => setMuted((m) => !m)}>{muted ? "🔇 unmute" : "🔊 mute"}</button>
            <button onClick={() => setTheatre(false)}>↩ back to the room</button>
            <button onClick={onLeave}>✕ leave</button>
          </div>
        </div>
      ) : null}

      {openedEntry ? (
        <div
          className={styles.inspect}
          role="dialog"
          aria-modal="true"
          aria-label={openedEntry.work.title}
        >
          <button
            className={`${styles.flip} ${flipped ? styles.flipped : ""}`}
            onClick={() => setFlipped((f) => !f)}
            aria-label="turn it over"
          >
            <div className={styles.flipIn}>
              <div className={`${styles.face} ${styles.faceFront}`}>
                <div
                  className={styles.big}
                  style={{
                    background: openedThumb
                      ? `center / cover no-repeat url("${openedThumb}"), ${artFor(openedEntry.work.title)}`
                      : artFor(openedEntry.work.title),
                  }}
                >
                  <span>{openedEntry.work.title}</span>
                </div>
                {/* the why is the point of the product; it should not need a flip */}
                <p className={styles.frontWhy}>{openedEntry.why}</p>
                <div className={styles.strip}>
                  {openedEntry.work.runtime} ·{" "}
                  {offers[0]?.provider.name.toUpperCase() ?? "NOT STREAMING HERE"}
                </div>
              </div>
              <div className={`${styles.face} ${styles.faceBack}`}>
                <h3>{openedEntry.work.title}</h3>
                <div className={styles.rt}>
                  {openedEntry.work.runtime} · {WEIGHT_LABEL[openedEntry.weight]} ·{" "}
                  {regionName(region)}
                </div>
                <p className={styles.quote}>{openedEntry.why}</p>
                <div className={styles.rt}>where to watch</div>
                <div className={styles.offers}>
                  {offers.length ? (
                    offers.map((offer) => (
                      <a
                        key={offer.provider.id}
                        className={styles.offer}
                        style={{ background: offer.provider.colour }}
                        href={offer.watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {offer.provider.name}
                        {paid.has(offer.provider.id) ? " ✓" : ""}
                      </a>
                    ))
                  ) : (
                    <span className={styles.rt}>not streaming in {regionName(region)}</span>
                  )}
                </div>
                {/* plan §6: the justwatch credit is per item, never a footer */}
                <div className={styles.rt}>{offers[0]?.attribution ?? "via JustWatch / TMDB"}</div>
              </div>
            </div>
          </button>
          <div className={styles.tools}>
            <button onClick={() => setFlipped((f) => !f)}>↻ turn it over</button>
            <button onClick={() => setOpened(null)} autoFocus>
              ✕ put it back
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
