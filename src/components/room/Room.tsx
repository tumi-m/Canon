"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Entry, Region } from "@/lib/schema";
import { WEIGHT_LABEL } from "@/lib/schema";
import { offersFor, regionName } from "@/lib/availability";
import { channelLabel, channelsFrom, embedUrl, surf } from "@/lib/youtube";
import { createRoomSound, STRIDE, type RoomSound } from "@/lib/roomSound";
import {
  aimAt,
  artFor,
  buildWorld,
  collide,
  G,
  nearestUnit,
  type Aim,
  type Sleeve,
  type Unit,
} from "./world";
import styles from "./Room.module.css";

type Props = {
  entries: readonly Entry[];
  region: Region;
  services: readonly string[];
  /** whose room this is, shown on the way in */
  displayName: string;
  onLeave: () => void;
  onBrowseList: () => void;
  onCapsule: () => void;
};

type Target = Aim & {
  readonly kind: "sleeve" | "capsule" | "tv";
  readonly key: string;
  readonly entry: number | null;
};

/** Everything the render loop mutates, kept out of React state. */
type Live = {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  bob: number;
  keys: Set<string>;
  stick: { x: number; y: number };
  aim: Target | null;
  raf: number;
  last: number;
  frame: number;
  /** distance walked since the last footstep */
  stride: number;
};

const KEYMAP: Record<string, string> = {
  w: "w", a: "a", s: "s", d: "d",
  arrowup: "w", arrowleft: "a", arrowdown: "s", arrowright: "d",
};

const FURNITURE_CLASS = {
  shelf: "",
  crate: styles.crate,
  wallet: styles.wallet,
  box: styles.box,
} as const;

/**
 * The room is portalled to <body> rather than rendered where it is mounted.
 * It has to be: making the rest of the page inert means walking body's
 * children, and a room nested inside <main> is *inside* the thing it needs to
 * switch off — so focus walks straight out of the den into the canon behind
 * it. A portal also keeps the fixed positioning out of reach of any ancestor
 * transform.
 */
export default function Room(props: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  /* captured here, in the outer component, because it has to be read before
     the scene mounts and moves focus to its own exit button */
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
  entries, region, services, displayName, onLeave, onBrowseList, onCapsule, host, opener,
}: Props & { host: HTMLElement; opener: React.RefObject<HTMLElement | null> }) {
  const world = useMemo(() => buildWorld(entries), [entries]);
  const paid = useMemo(() => new Set(services), [services]);

  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLButtonElement>(null);
  const nubRef = useRef<HTMLElement>(null);

  const [at, setAt] = useState<string | null>(null);
  const [aimKey, setAimKey] = useState<string | null>(null);
  const [aimLabel, setAimLabel] = useState<{ title: string; hint: string } | null>(null);
  const [opened, setOpened] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [coarse, setCoarse] = useState(false);

  const reduced = useRef(false);
  const touch = useRef(false);
  const live = useRef<Live>({
    x: 0, z: G.spawnZ, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0,
    keys: new Set(), stick: { x: 0, y: 0 }, aim: null, raf: 0, last: 0, frame: 0, stride: 0,
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

  // the room goes quiet while the television is talking
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

  /** Reticle targets: every real sleeve, plus the capsule at the back. */
  const targets = useMemo<Target[]>(() => {
    const list: Target[] = [];
    for (const unit of world.units) {
      for (const s of unit.sleeves) {
        if (s.entry === null) continue;
        list.push({ kind: "sleeve", key: s.key, entry: s.entry, x: s.x, y: s.y, z: s.z });
      }
    }
    list.push({ kind: "capsule", key: "__capsule", entry: null, x: 0, y: 0, z: world.hatchZ });
    list.push({ kind: "tv", key: "__tv", entry: null, x: 1035, y: -40, z: -280 });
    return list;
  }, [world]);

  const activate = useCallback(
    (target: Target | null) => {
      if (!target) return;
      if (target.kind === "capsule") return onCapsule();
      if (target.kind === "tv") {
        setTvOn((on) => !on);
        sound.current?.clack();
        return;
      }
      if (target.entry !== null) {
        setOpened(target.entry);
        setFlipped(false);
        sound.current?.pick();
      }
    },
    [onCapsule],
  );

  /* ---------- the render loop ---------- */
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    touch.current = window.matchMedia("(pointer:coarse)").matches;
    setCoarse(touch.current);
    const L = live.current;
    const el = worldRef.current;
    if (!el) return;

    const apply = () => {
      const rm = reduced.current;
      el.style.setProperty("--cx", `${L.x.toFixed(1)}px`);
      el.style.setProperty("--cy", `${(rm ? 0 : Math.sin(L.bob) * 6).toFixed(1)}px`);
      el.style.setProperty("--cz", `${L.z.toFixed(1)}px`);
      el.style.setProperty("--yaw", `${L.yaw.toFixed(2)}deg`);
      el.style.setProperty("--pitch", `${L.pitch.toFixed(2)}deg`);
      el.style.setProperty("--roll", `${(rm ? 0 : Math.sin(L.bob * 0.5) * 0.45).toFixed(2)}deg`);
    };

    /* css 3d paints everything, including the wall behind you, which the fixed
       eye plane then magnifies into a smear. hide what is out of play — it is
       also most of the frame budget. */
    const cullable = Array.from(el.querySelectorAll<HTMLElement>("[data-cull]")).map((node) => ({
      node,
      x: Number(node.dataset.cx ?? 0),
      z: Number(node.dataset.cz ?? 0),
      margin: Number(node.dataset.cull ?? 160),
      on: true,
    }));

    const cull = () => {
      const yaw = (L.yaw * Math.PI) / 180;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      for (const item of cullable) {
        const depth = (item.x - L.x) * s - (item.z - L.z) * c;
        const on = depth > -item.margin && depth < 5200;
        if (on !== item.on) {
          item.on = on;
          item.node.style.visibility = on ? "" : "hidden";
        }
      }
    };

    const step = (dt: number) => {
      const f = (L.keys.has("w") ? 1 : 0) - (L.keys.has("s") ? 1 : 0) + L.stick.y;
      const r = (L.keys.has("d") ? 1 : 0) - (L.keys.has("a") ? 1 : 0) + L.stick.x;
      const yaw = (L.yaw * Math.PI) / 180;
      const ix = Math.sin(yaw) * f + Math.cos(yaw) * r;
      const iz = -Math.cos(yaw) * f + Math.sin(yaw) * r;
      const mag = Math.hypot(ix, iz);
      const tx = mag ? (ix / mag) * G.speed : 0;
      const tz = mag ? (iz / mag) * G.speed : 0;
      const k = Math.min(1, dt * (reduced.current ? 40 : 9));
      L.vx += (tx - L.vx) * k;
      L.vz += (tz - L.vz) * k;
      const [nx, nz] = collide(L.x + L.vx * dt, L.z + L.vz * dt, world.boxes, world.bounds);
      L.x = nx;
      L.z = nz;
      const speed = Math.hypot(L.vx, L.vz);
      L.bob += speed * dt * 0.024;
      L.stride += speed * dt;
      if (L.stride > STRIDE) {
        L.stride = 0;
        sound.current?.step();
      }
      apply();
    };

    const loop = (t: number) => {
      // clamped so a slow frame cannot step further than the collision radius
      const dt = Math.min(0.1, (t - L.last) / 1000 || 0.016);
      L.last = t;
      step(dt);
      if (++L.frame % 3 === 0) {
        const hit = aimAt(targets, L);
        if (hit?.key !== L.aim?.key) {
          L.aim = hit ?? null;
          setAimKey(hit?.key ?? null);
          if (!hit) setAimLabel(null);
          else if (hit.kind === "capsule")
            setAimLabel({ title: "the capsule", hint: "E · SEALED UNTIL ITS DATE" });
          else if (hit.kind === "tv")
            setAimLabel({ title: "the television", hint: "E · SURF THE CANON" });
          else
            setAimLabel({
              title: entries[hit.entry!]?.work.title ?? "",
              hint: "E · TAKE IT OFF THE SHELF",
            });
        }
        setAt(nearestUnit(world.units, L)?.label ?? null);
      }
      if (L.frame % 6 === 0) cull();
      L.raf = requestAnimationFrame(loop);
    };

    apply();
    cull();
    L.last = performance.now();
    L.raf = requestAnimationFrame(loop);
    exitRef.current?.focus({ preventScroll: true });

    return () => cancelAnimationFrame(L.raf);
  }, [world, targets, entries]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const L = live.current;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (KEYMAP[k]) {
        L.keys.add(KEYMAP[k]!);
        e.preventDefault();
        return;
      }
      if (k === "e" || k === "enter") {
        if (opened === null) activate(L.aim);
        e.preventDefault();
        return;
      }
      if (k === "t") {
        setTvOn((on) => !on);
        e.preventDefault();
        return;
      }
      if (k === "]" || k === ".") {
        tune(1);
        e.preventDefault();
        return;
      }
      if (k === "[" || k === ",") {
        tune(-1);
        e.preventDefault();
        return;
      }
      if (k === "m") {
        setMuted((m) => !m);
        e.preventDefault();
        return;
      }
      if (k === "escape") {
        if (opened !== null) setOpened(null);
        else if (document.pointerLockElement === rootRef.current) document.exitPointerLock();
        else onLeave();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYMAP[e.key.toLowerCase()];
      if (k) L.keys.delete(k);
    };
    const blur = () => L.keys.clear();
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [activate, onLeave, opened, tune]);

  /* ---------- looking around ---------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const L = live.current;
    const clamp = (p: number) => Math.max(-38, Math.min(38, p));
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

  return (
    <>
      <div
        ref={rootRef}
        className={styles.room}
        role="application"
        aria-label={`${displayName}'s room`}
      >
        <div ref={worldRef} className={styles.world}>
          <div className={styles.floor} />
          <div className={styles.ceil} />
          <div
            className={styles.rug}
            style={{ transform: "translate3d(0,286px,-260px) rotateX(90deg)" }}
          />
          <div
            className={`${styles.wall} ${styles.wallSide}`}
            style={{ transform: `translateX(${-G.roomX}px) rotateY(90deg)` }}
          />
          <div
            className={`${styles.wall} ${styles.wallSide}`}
            style={{ transform: `translateX(${G.roomX}px) rotateY(-90deg)` }}
          />
          <div
            className={`${styles.wall} ${styles.wallEnd}`}
            style={{ transform: `translate3d(0,0,${G.backZ}px)` }}
          />
          <div
            className={`${styles.wall} ${styles.wallEnd}`}
            data-cull="160"
            data-cx={0}
            data-cz={G.frontZ}
            style={{ transform: `translate3d(0,0,${G.frontZ}px) rotateY(180deg)` }}
          />

          {world.lamps.map((lamp) => (
            <div
              key={lamp.key}
              className={`${styles.lamp} ${lamp.warm ? "" : styles.lampCool}`}
              data-cull="160"
              data-cx={lamp.x}
              data-cz={lamp.z}
              style={{ transform: `translate3d(${lamp.x}px,${lamp.y}px,${lamp.z}px)` }}
            />
          ))}
          {world.motes.map((z) => (
            <div
              key={`m${z}`}
              className={styles.motes}
              data-cull="160"
              data-cx={0}
              data-cz={z}
              style={{ transform: `translate3d(0,0,${z}px)` }}
            />
          ))}

          {/* the things that make it a room, not a warehouse */}
          <div
            className={styles.table}
            data-cull="200"
            data-cx={0}
            data-cz={-60}
            style={{ transform: "translate3d(0,190px,10px) rotateX(74deg)" }}
          />
          <div
            className={styles.couch}
            data-cull="240"
            data-cx={-790}
            data-cz={-550}
            style={{ transform: "translate3d(-790px,150px,-550px) rotateY(74deg)" }}
          />
          <div
            className={`${styles.tv} ${aimKey === "__tv" ? styles.tvAimed : ""}`}
            data-cull="240"
            data-cx={1035}
            data-cz={-280}
            style={{ transform: "translate3d(1035px,-40px,-280px) rotateY(-90deg)" }}
            onClick={(e) => {
              e.stopPropagation();
              setTvOn((on) => !on);
            }}
          >
            <span className={styles.tube}>
            {playing ? (
              <>
                {/*
                  Official iframe embed only (plan §6) — never proxied, never
                  rehosted, so the view counts for whoever made it. Pointer
                  events are off so the room keeps the mouse: the dial is on
                  the hud, which is what makes surfing feel like a television
                  rather than a web page.
                */}
                <iframe
                  key={`${playing.videoId}:${muted ? "m" : "s"}`}
                  className={styles.screen}
                  src={embedUrl(playing.videoId, { muted })}
                  title={playing.title}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
                <span className={styles.osd}>
                  {channelLabel(channel)}
                  {muted ? " · MUTED" : ""}
                </span>
              </>
            ) : (
              <>
                <span className={styles.static} />
                <b>
                  {channels.length ? (
                    <>
                      OFF
                      <br />
                      {channels.length} CHANNELS
                    </>
                  ) : (
                    <>
                      NO SIGNAL
                      <br />
                      NOTHING EMBEDDABLE
                    </>
                  )}
                </b>
              </>
            )}
            </span>
            <span className={styles.grille} />
            <span className={`${styles.power} ${tvOn ? styles.powerOn : ""}`} />
          </div>

          {world.units.map((unit) => (
            <div
              key={unit.key}
              className={`${styles.unit} ${FURNITURE_CLASS[unit.furniture]}`}
              data-cull="240"
              data-cx={unit.fx}
              data-cz={unit.fz}
              style={{
                width: unit.width,
                height: unit.height,
                marginLeft: -unit.width / 2,
                marginTop: -unit.height / 2,
                transform:
                  `translate3d(${unit.fx}px,${unit.fy}px,${unit.fz}px)` +
                  ` rotateY(${unit.rot}deg) rotateX(${unit.tilt}deg)`,
              }}
            >
              {unit.furniture === "shelf"
                ? Array.from({ length: unit.rows }, (_, r) => (
                    <div key={`l${r}`} className={styles.ledge} style={{ top: 22 + r * 208 + 196 }} />
                  ))
                : null}
              {unit.filler ? null : <span className={styles.label}>{unit.label}</span>}
              {unit.sleeves.map((s) => (
                <SleeveCase
                  key={s.key}
                  node={s}
                  unit={unit}
                  entry={s.entry === null ? undefined : entries[s.entry]}
                  region={region}
                  paid={paid}
                  aimed={aimKey === s.key}
                  onOpen={() => s.entry !== null && (setOpened(s.entry), setFlipped(false))}
                />
              ))}
            </div>
          ))}

          {/* what outlives the room */}
          <div
            className={styles.hatch}
            style={{ transform: `translate3d(-690px,-70px,${world.hatchZ}px) rotateY(18deg)` }}
            onClick={(e) => {
              e.stopPropagation();
              onCapsule();
            }}
          >
            <b>
              THE
              <br />
              CAPSULE
            </b>
            <small>SEALED UNTIL ITS DATE</small>
          </div>
        </div>
      </div>

      <div className={styles.dust} />
      <div className={styles.vign} />
      <div className={`${styles.retic} ${aimKey ? styles.reticHot : ""}`} />
      {aimLabel ? (
        <div className={styles.aimLabel}>
          {aimLabel.title}
          <small>{aimLabel.hint}</small>
        </div>
      ) : null}

      <div className={styles.shelfList}>
        {world.units
          .filter((u) => !u.filler)
          .map((unit) => (
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
        </button>
        <span className={styles.now}>
          {playing ? `${channelLabel(channel)} · ${playing.title}` : (at ?? `${displayName}'s room`)}
        </span>
      </div>

      <div className={`${styles.hud} ${styles.hudBot}`} inert={opened !== null ? true : undefined}>
        <button title="step left" {...hold("a")}>◀</button>
        <button title="step back" {...hold("s")}>▼</button>
        <button title="step forward" {...hold("w")}>▲</button>
        <button title="step right" {...hold("d")}>▶</button>
        <button onClick={() => setTvOn((on) => !on)} title="the television (t)">
          {tvOn ? "◼ tv off" : "▶ tv on"}
        </button>
        {tvOn && channels.length > 0 ? (
          <>
            <button onClick={() => tune(-1)} title="previous channel ([)">
              ⏮
            </button>
            <button onClick={() => tune(1)} title="next channel (])">
              ⏭
            </button>
            <button onClick={() => setMuted((m) => !m)} title="mute (m)">
              {muted ? "🔇 unmute" : "🔊 mute"}
            </button>
          </>
        ) : null}
        <button onClick={toggleSound} title="room sound — footsteps, not a soundtrack">
          {audible ? "◉ room sound" : "○ room sound"}
        </button>
        <button onClick={onBrowseList}>☰ read it as a list</button>
        <span className={styles.hint}>
          {coarse
            ? "drag the pad to walk · drag the room to look · tap a sleeve"
            : "wasd to walk · click to look around · e to take something off the shelf"}
        </span>
      </div>

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
                <div className={styles.big} style={{ background: artFor(openedEntry.work.title) }}>
                  <span>{openedEntry.work.title}</span>
                </div>
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

const SIZES = {
  shelf: { w: 168, h: 196 },
  crate: { w: 196, h: 176 },
  wallet: { w: 150, h: 150 },
  box: { w: 120, h: 120 },
} as const;

function SleeveCase({
  node, unit, entry, region, paid, aimed, onOpen,
}: {
  node: Sleeve;
  unit: Unit;
  entry: Entry | undefined;
  region: Region;
  paid: ReadonlySet<string>;
  aimed: boolean;
  onOpen: () => void;
}) {
  const size = SIZES[unit.furniture];

  if (!entry) {
    // the household's own clutter: anonymous, non-interactive set dressing
    return (
      <div
        className={`${styles.sleeve} ${styles.clutter}`}
        style={{ left: node.left, top: node.top, width: size.w, height: size.h }}
        aria-hidden="true"
      >
        <div className={styles.art} style={{ background: artFor(`clutter${node.seed}`) }} />
        <div className={styles.band} />
      </div>
    );
  }

  const offers = offersFor(entry.work.id, region);
  const here = offers.some((o) => o.provider.kind === "free" || paid.has(o.provider.id));
  return (
    <button
      className={[
        styles.sleeve,
        entry.weight === 3 ? styles.changed : "",
        here ? "" : styles.elsewhere,
        aimed ? styles.aimed : "",
      ].join(" ")}
      style={{ left: node.left, top: node.top, width: size.w, height: size.h }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      tabIndex={-1}
    >
      <span className={styles.art} style={{ background: artFor(entry.work.title) }}>
        <span>{entry.work.title.slice(0, 40)}</span>
      </span>
      <span className={styles.band}>
        <em>
          {(offers[0]?.provider.name ?? "—").toUpperCase()} · {entry.work.runtime}
        </em>
      </span>
    </button>
  );
}
