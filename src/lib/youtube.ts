import type { Entry } from "./schema";

/**
 * YouTube, the honest way.
 *
 * docs/PLAN.md §6: official iframe embed only. Never proxy, download or
 * rehost — an embedded view counts for the creator, which is both true and
 * the reason this is defensible. `youtube-nocookie.com` for the privacy win.
 *
 * Everything here is pure so the id parsing can be tested without a browser.
 */

const HOST = "https://www.youtube-nocookie.com/embed/";

/** 11-char ids, the only shape YouTube has ever issued. */
const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pull a video id out of whatever shape of link somebody pasted.
 * Returns null rather than guessing — a wrong id is a broken embed.
 */
export function videoIdFrom(input: string): string | null {
  if (ID.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const take = (value: string | null | undefined) =>
    value && ID.test(value) ? value : null;

  if (host === "youtu.be") return take(url.pathname.slice(1).split("/")[0]);

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return take(url.searchParams.get("v"));
    const [, first, second] = url.pathname.split("/");
    // /embed/ID, /v/ID, /shorts/ID, /live/ID
    if (first && ["embed", "v", "shorts", "live"].includes(first)) return take(second);
  }
  return null;
}

export type EmbedOptions = {
  /** browsers block autoplay with sound; start muted and let the viewer unmute */
  muted?: boolean;
  autoplay?: boolean;
  /** where the embed is hosted, required by some YouTube setups */
  origin?: string;
};

export function embedUrl(videoId: string, options: EmbedOptions = {}): string {
  const { muted = true, autoplay = true, origin } = options;
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    mute: muted ? "1" : "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    // no related-video grid at the end — this is somebody's shelf, not a feed
    iv_load_policy: "3",
  });
  if (origin) params.set("origin", origin);
  return `${HOST}${videoId}?${params.toString()}`;
}

/**
 * The official thumbnail endpoint. An <img> pointing at YouTube's own CDN —
 * no scraping, no rehosting, nothing cached on our side.
 * `hqdefault` exists for every video ever uploaded; the higher resolutions
 * do not, and a missing one renders as a grey placeholder.
 */
export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** The artwork for an entry, when there is any. */
export function thumbnailForEntry(entry: {
  work: { youtubeId?: string | undefined; url: string };
}): string | null {
  const id = entry.work.youtubeId ?? videoIdFrom(entry.work.url);
  return id ? thumbnailFor(id) : null;
}

export type Channel = {
  readonly number: number;
  readonly entryIndex: number;
  readonly videoId: string;
  readonly title: string;
  readonly runtime: string;
};

/**
 * The canon as channels you can surf — the MyRetroTVs trick, made personal.
 * Only entries that are actually embeddable get one; a Wikipedia link has no
 * channel, and pretending otherwise would put a dead screen on the wall.
 */
export function channelsFrom(entries: readonly Entry[]): readonly Channel[] {
  const channels: Channel[] = [];
  entries.forEach((entry, entryIndex) => {
    const videoId = entry.work.youtubeId ?? videoIdFrom(entry.work.url);
    if (!videoId) return;
    channels.push({
      number: channels.length + 1,
      entryIndex,
      videoId,
      title: entry.work.title,
      runtime: entry.work.runtime,
    });
  });
  return channels;
}

/** Wrap around in both directions, the way a real dial does. */
export function surf(channels: readonly Channel[], current: number, step: number): number {
  if (channels.length === 0) return 0;
  const next = (current + step) % channels.length;
  return next < 0 ? next + channels.length : next;
}

export function channelLabel(index: number): string {
  return `CH ${String(index + 1).padStart(2, "0")}`;
}
