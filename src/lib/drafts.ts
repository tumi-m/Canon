import { z } from "zod";
import { entrySchema, WHY_MAX, weightSchema, type Entry, type Kind, type Weight } from "./schema";
import { videoIdFrom } from "./youtube";

/**
 * Adding to a canon, before there is anywhere to save it.
 *
 * Writes belong to M3, which needs the database (M1) and sign-in (M2). Until
 * then what somebody adds is a *draft*: validated exactly as the real write
 * will be, kept in this browser only, and marked as a draft everywhere it is
 * shown. Nothing here pretends to have saved anything to anybody's canon.
 */

/** What the form collects. The same shape the M3 server action will take. */
export const newLinkSchema = z.object({
  url: z
    .url("that does not look like a link — paste the whole address")
    .refine((u) => /^https?:\/\//i.test(u), "only web links (http or https)"),
  title: z.string().trim().min(1, "give it a title").max(200, "keep the title under 200 characters"),
  why: z
    .string()
    .trim()
    .min(1, "say why it is here — that is the point of a canon")
    .max(WHY_MAX, `keep the why to ${WHY_MAX} characters`),
  weight: weightSchema,
  /** "played to death": the pieces somebody keeps going back to */
  highlighted: z.boolean().default(false),
  runtime: z.string().trim().max(20, "keep the runtime short, like 1hr 47m").optional(),
});
export type NewLink = z.input<typeof newLinkSchema>;

/** Best guess at what a link is, from where it points. Wrong guesses are harmless. */
export function kindFromUrl(url: string): Kind {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "other";
  }
  const on = (...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));
  if (videoIdFrom(url)) return "youtube";
  if (on("netflix.com", "imdb.com", "letterboxd.com", "mubi.com", "criterionchannel.com")) return "film";
  if (on("spotify.com", "bandcamp.com", "soundcloud.com", "music.apple.com", "tidal.com")) return "music";
  if (on("wikipedia.org", "substack.com", "medium.com", "nytimes.com", "newyorker.com")) return "article";
  return "other";
}

export const DRAFT_PREFIX = "draft-";

export function isDraft(entry: Entry): boolean {
  return entry.work.id.startsWith(DRAFT_PREFIX);
}

/** Turn a validated form into an entry, shaped exactly like a saved one. */
export function entryFromLink(link: z.output<typeof newLinkSchema>, id: string): Entry {
  const youtubeId = videoIdFrom(link.url) ?? undefined;
  return entrySchema.parse({
    work: {
      id: `${DRAFT_PREFIX}${id}`,
      kind: kindFromUrl(link.url),
      title: link.title,
      url: link.url,
      ...(youtubeId ? { youtubeId } : {}),
      runtime: link.runtime || "—",
    },
    why: link.why,
    weight: link.weight,
    highlighted: link.highlighted,
  });
}

/**
 * Read drafts back out of storage. Storage is input like any other — it can
 * be stale, hand-edited or from an older build — so every entry is parsed
 * again and anything that does not parse is dropped rather than trusted.
 */
export function parseStored(raw: string | null): Entry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const parsed = entrySchema.safeParse(item);
    return parsed.success && isDraft(parsed.data) ? [parsed.data] : [];
  });
}

const key = (handle: string) => `canon:drafts:${handle}`;
/** fired on this page whenever the drafts change, so every view can follow */
export const DRAFTS_EVENT = "canon:drafts";

export function loadDrafts(handle: string): Entry[] {
  try {
    return parseStored(window.localStorage.getItem(key(handle)));
  } catch {
    // private mode, storage blocked, or no window: there are simply no drafts
    return [];
  }
}

export function saveDrafts(handle: string, drafts: readonly Entry[]): boolean {
  try {
    window.localStorage.setItem(key(handle), JSON.stringify(drafts));
    window.dispatchEvent(new CustomEvent(DRAFTS_EVENT, { detail: handle }));
    return true;
  } catch {
    return false;
  }
}

export type Accepts = { weight: Weight; highlighted: boolean };
