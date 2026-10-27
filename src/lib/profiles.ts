import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./schema";
import { handleSchema } from "./schema";
import type { ProfileRecord } from "./database.types";
import { publicSupabase, serverSupabase } from "./supabase/server";

/**
 * Accounts, from the server's side: who is signed in, and the canon behind a
 * handle that belongs to an account rather than to the seed data.
 */

export type Account = {
  readonly user: User;
  /** null until they have claimed a handle */
  readonly profile: ProfileRecord | null;
};

/** Who is signed in, checked with the auth server — not just read off a cookie. */
export async function currentAccount(): Promise<Account | null> {
  const supabase = await serverSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`could not read the profile for ${user.id}: ${error.message}`);
  return { user, profile };
}

/**
 * The canon at a handle that belongs to an account. Its shelves arrive with
 * M3; until then it is the person — name, line, region — and an empty room
 * to start putting things in.
 */
export async function accountCanon(handle: string): Promise<Profile | null> {
  const parsed = handleSchema.safeParse(handle.toLowerCase());
  if (!parsed.success) return null;
  const supabase = publicSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("handle", parsed.data).maybeSingle();
  // a database that cannot be reached is an outage, not a missing page
  if (error) throw new Error(`could not look up /${parsed.data}: ${error.message}`);
  if (!data) return null;
  return {
    handle: data.handle,
    displayName: data.display_name,
    bio: data.bio,
    region: data.region,
    audience: data.default_audience,
    entries: [],
  };
}

/**
 * Where this site is being served from, for the address a provider sends
 * people back to. NEXT_PUBLIC_SITE_URL pins it when set; otherwise it is the
 * host the request came in on, which Supabase still checks against the
 * redirect URLs allowed in the project's auth settings.
 */
export async function siteOrigin(): Promise<string> {
  const pinned = process.env.NEXT_PUBLIC_SITE_URL;
  if (pinned) return pinned.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** The country Vercel says the request came from, when it says. */
export async function visitorCountry(): Promise<string | null> {
  const h = await headers();
  return h.get("x-vercel-ip-country");
}
