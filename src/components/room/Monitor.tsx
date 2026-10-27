"use client";

import { useEffect, useState } from "react";
import { channelLabel, embedUrl, type Channel } from "@/lib/youtube";
import styles from "./Monitor.module.css";

/**
 * The big screen, as the screen most of these were first watched on: an
 * off-white CRT from the end of the nineties, running an XP-era desktop, the
 * video playing in a media player window on it.
 *
 * It is an evocation drawn in css — no operating system's logo, wallpaper
 * photograph or sound is copied — and every part of it works: the window's
 * close button goes back to the room, the transport buttons work the dial,
 * the start menu lists every channel to tune to, and the clock in the tray
 * tells the time.
 */
export default function Monitor({
  playing,
  channel,
  channels,
  muted,
  onTune,
  onTuneTo,
  onMute,
  onBack,
  onLeave,
}: {
  playing: Channel;
  channel: number;
  channels: readonly Channel[];
  muted: boolean;
  onTune: (step: number) => void;
  onTuneTo: (index: number) => void;
  onMute: () => void;
  onBack: () => void;
  onLeave: () => void;
}) {
  const [start, setStart] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(tick);
  }, []);

  const clock = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const name = `${channelLabel(channel)} · ${playing.title}`;

  return (
    <div className={styles.desk}>
      <div className={styles.monitor}>
        <div className={styles.glass}>
          <div className={styles.desktop}>
            {/* decoration: the icons of a desktop somebody actually used */}
            <div className={styles.icons} aria-hidden="true">
              <span className={styles.icon}>
                <i className={styles.folder} />
                my canon
              </span>
              <span className={styles.icon}>
                <i className={styles.disc} />
                {channels.length} channels
              </span>
              <span className={styles.icon}>
                <i className={styles.bin} />
                the bin
              </span>
            </div>

            <section className={styles.window} aria-label="the player">
              <header className={styles.titlebar}>
                <i className={styles.appIcon} aria-hidden="true" />
                <span className={styles.titleText}>{name} — the set</span>
                <span className={styles.caption} aria-hidden="true">
                  <i className={styles.min} />
                  <i className={styles.max} />
                </span>
                <button className={styles.close} onClick={onBack} aria-label="close the player" title="close — back to the room">
                  ×
                </button>
              </header>
              <div className={styles.screen}>
                {/* the official embed, full size, with its own controls: this is
                    a screen you are watching, not a prop in a room */}
                <iframe
                  key={`${playing.videoId}:${muted ? "m" : "s"}:big`}
                  src={embedUrl(playing.videoId, { muted })}
                  title={playing.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
              <footer className={styles.transport}>
                <button onClick={() => onTune(-1)} title="previous channel ([)">
                  ⏮ previous
                </button>
                <button onClick={() => onTune(1)} title="next channel (])">
                  ⏭ next
                </button>
                <button onClick={onMute} title="mute (m)" aria-pressed={!muted}>
                  {muted ? "🔇 unmute" : "🔊 mute"}
                </button>
                <span className={styles.now} aria-live="polite">
                  {channelLabel(channel)} of {channels.length}
                </span>
              </footer>
            </section>

            {start ? (
              <nav
                className={styles.startMenu}
                aria-label="channels"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setStart(false);
                  }
                }}
              >
                <p className={styles.menuHead}>the canon · {channels.length} channels</p>
                <ul>
                  {channels.map((c, i) => (
                    <li key={c.videoId + i}>
                      <button
                        className={i === channel ? styles.menuOn : undefined}
                        aria-current={i === channel ? "true" : undefined}
                        onClick={() => {
                          onTuneTo(i);
                          setStart(false);
                        }}
                      >
                        <b>{channelLabel(i)}</b> {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            <div className={styles.taskbar}>
              <button
                className={styles.start}
                onClick={() => setStart((s) => !s)}
                aria-expanded={start}
                title="every channel"
              >
                start
              </button>
              <span className={styles.task}>{name}</span>
              {/* focus starts inside the screen, so the keyboard is where the eyes are */}
              <button className={styles.taskButton} onClick={onBack} autoFocus>
                ↩ back to the room
              </button>
              <button className={styles.taskButton} onClick={onLeave}>
                ✕ leave
              </button>
              <span className={styles.tray}>{clock}</span>
            </div>
          </div>
          {/* the tube: scanlines, the curve of the glass, a reflection — over
              everything, and never in the way of a click */}
          <div className={styles.tube} aria-hidden="true" />
        </div>
        <div className={styles.chin} aria-hidden="true">
          {/* the product's own wordmark, lowercase with its dot: in capitals on a
              piece of hardware it read as somebody else's brand */}
          <span className={styles.badge}>
            canon<b>.</b>
          </span>
          <span className={styles.knobs}>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.power}>
            <i className={styles.led} />
          </span>
        </div>
      </div>
      <div className={styles.stand} aria-hidden="true" />
    </div>
  );
}
