/**
 * Room sound.
 *
 * The question was whether the room needs audio or whether the YouTube links
 * are enough. The answer this file takes: **the content's sound is YouTube's
 * job, and the room's sound is a different job.** A music bed would fight the
 * thing you came to watch. What is actually missing is feedback — the sense
 * that you are moving through a space and touching objects in it.
 *
 * So: no soundtrack, no assets, no download. A few hundred bytes of Web Audio
 * that make footsteps on floorboards and a click when a case comes off the
 * shelf, plus a barely-there room tone. It is **off by default** — nobody's
 * first second on a page should be noise — and it ducks itself out of the way
 * whenever the television is on.
 */

type Voice = { ctx: AudioContext; master: GainNode; tone: GainNode };

export type RoomSound = {
  step(): void;
  pick(): void;
  clack(): void;
  /** quieten the room while the television is doing the talking */
  duck(on: boolean): void;
  close(): void;
};

/** Filtered noise — a footstep on board, not a beep. */
function noiseBurst(v: Voice, duration: number, frequency: number, gain: number) {
  const { ctx } = v;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // decaying noise; the square of the envelope reads as a soft thud
    const t = 1 - i / frames;
    data[i] = (Math.random() * 2 - 1) * t * t;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.9;

  const level = ctx.createGain();
  level.gain.value = gain;

  source.connect(filter).connect(level).connect(v.master);
  source.start();
  source.stop(ctx.currentTime + duration);
}

/**
 * Build the audio graph. Must be called from a user gesture — browsers refuse
 * to start an AudioContext otherwise, which is the correct default and the
 * reason the toggle exists at all.
 */
export function createRoomSound(): RoomSound | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // room tone: a whisper of low noise, the sound of a room being a room
  const frames = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    // brown-ish noise: integrated white, which sits far below the content
    last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
    data[i] = last;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 320;

  const tone = ctx.createGain();
  tone.gain.value = 0.16;
  source.connect(toneFilter).connect(tone).connect(master);
  source.start();

  const v: Voice = { ctx, master, tone };

  return {
    step: () => noiseBurst(v, 0.11, 190 + Math.random() * 70, 0.5),
    pick: () => noiseBurst(v, 0.07, 1400 + Math.random() * 400, 0.32),
    clack: () => noiseBurst(v, 0.05, 900, 0.26),
    duck: (on: boolean) => {
      const target = on ? 0.12 : 0.5;
      master.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
    },
    close: () => {
      try {
        source.stop();
      } catch {
        // already stopped; nothing to do
      }
      void ctx.close();
    },
  };
}

/**
 * How far you walk between footsteps, in world units. Pulled out so the
 * cadence is a number somebody can reason about rather than a magic constant
 * buried in the render loop.
 */
export const STRIDE = 170;
