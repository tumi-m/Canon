import { z } from "zod";

/**
 * The shapes the product is made of.
 *
 * These are the single source of truth for the two limits the plan insists on
 * being enforced in three places (DB CHECK, API, UI): a why is at most 200
 * characters and a note at most 300. The UI reads its `maxLength` from
 * WHY_MAX / NOTE_MAX so the three can never drift apart in the browser, and
 * the migration in M1 must carry the same numbers.
 */
export const WHY_MAX = 200;
export const NOTE_MAX = 300;

/** 3 is farza's red tier: the pieces that actually changed you. */
export const weightSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Weight = z.infer<typeof weightSchema>;

export const WEIGHT_LABEL: Record<Weight, string> = {
  1: "solid",
  2: "great",
  3: "changed me",
};

export const kindSchema = z.enum([
  "youtube",
  "film",
  "tv",
  "article",
  "music",
  "other",
]);
export type Kind = z.infer<typeof kindSchema>;

/** ISO 3166-1 alpha-2, lowercased — matches the `region` column in the plan. */
export const regionSchema = z
  .string()
  .regex(/^[a-z]{2}$/, "region must be a two-letter iso code, lowercase");
export type Region = z.infer<typeof regionSchema>;

export const handleSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,20}$/, "handles are 3-20 chars: a-z, 0-9 and _");

export const workSchema = z.object({
  id: z.string().min(1),
  kind: kindSchema,
  title: z.string().min(1).max(200),
  url: z.url(),
  youtubeId: z.string().optional(),
  /** as written by a human — "1hr 47m". parsed by lib/runtime. */
  runtime: z.string().min(1),
});
export type Work = z.infer<typeof workSchema>;

export const entrySchema = z.object({
  work: workSchema,
  why: z.string().min(1).max(WHY_MAX),
  weight: weightSchema,
  highlighted: z.boolean().default(false),
});
export type Entry = z.infer<typeof entrySchema>;

export const noteSchema = z.object({
  body: z.string().min(1).max(NOTE_MAX),
});

export const profileSchema = z.object({
  handle: handleSchema,
  displayName: z.string().min(1).max(80),
  bio: z.string().max(200),
  region: regionSchema,
  entries: z.array(entrySchema),
});
export type Profile = z.infer<typeof profileSchema>;
