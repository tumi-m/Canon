import { z } from "zod";
import { handleSchema } from "./schema";
import { allHandles } from "./canon";
import { isKnownRegion } from "./availability";

/**
 * The rules an account lives by, as pure functions: what a handle may be,
 * where a sign-in may send you afterwards, what a profile edit may contain.
 * The same rules are checked in the browser (the inputs' own attributes), on
 * the server (these schemas) and in the database (its CHECK constraints) —
 * the database is the one that counts.
 */

export const providerSchema = z.enum(["google", "apple"]);
export type Provider = z.infer<typeof providerSchema>;

/**
 * Handles that would collide with a page of the site, or with a seed canon
 * that is already being shown at that address.
 */
const RESERVED = new Set([
  "about", "account", "admin", "api", "app", "auth", "callback", "canon", "help", "home",
  "login", "logout", "me", "new", "settings", "signin", "signout", "signup", "support",
  "welcome", "www",
]);

export const isReserved = (handle: string) => RESERVED.has(handle) || allHandles().includes(handle);

/** A handle as somebody types it: trimmed, lowercased, then held to the rule. */
export const claimHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(handleSchema)
  .refine((handle) => !isReserved(handle), "that one is taken");

export const displayNameSchema = z.string().trim().min(1, "a name to go on the canon").max(80);

export const claimSchema = z.object({
  handle: claimHandleSchema,
  displayName: displayNameSchema,
});

export const profileEditSchema = z.object({
  displayName: displayNameSchema,
  bio: z.string().trim().max(200),
  region: z
    .string()
    .trim()
    .toLowerCase()
    .refine((region) => isKnownRegion(region), "a region we have streaming data for"),
});

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(320));

/**
 * Where to go after signing in: a path on this site, or the account page.
 *
 * `next` arrives in a query string anybody can write, so anything that is
 * not plainly a local path — `//elsewhere.com`, `/\elsewhere.com`, a full
 * URL, a `javascript:` — is ignored rather than followed. An open redirect
 * on a sign-in page is how a convincing phishing link is made.
 */
export function safeNext(next: unknown, fallback = "/account"): string {
  if (typeof next !== "string" || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // a control character or a backslash anywhere is not a path anybody typed
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const resolved = new URL(next, "https://canon.invalid");
    if (resolved.origin !== "https://canon.invalid") return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}

/** The address a provider sends you back to, carrying where you were going. */
export const callbackUrl = (origin: string, next: string) =>
  `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;

/**
 * A first suggestion for a handle, from the name the provider gave or the
 * front of the email address. Only ever a suggestion: the person types the
 * one they want, and the database decides whether it is free.
 */
export function suggestHandle(name: string | null | undefined, email: string | null | undefined): string {
  const from = (name || email?.split("@")[0] || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return claimHandleSchema.safeParse(from).success ? from : "";
}

/** The region a new canon starts in: where the person is, if we have data for it. */
export function regionFrom(country: string | null | undefined): string {
  const region = (country ?? "").toLowerCase();
  return isKnownRegion(region) ? region : "us";
}
