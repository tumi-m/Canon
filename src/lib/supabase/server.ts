import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "./env";

/**
 * Supabase on the server, as whoever is signed in: the session lives in
 * cookies, and every query runs under row level security as that person.
 * Null when accounts are not switched on.
 */
export async function serverSupabase() {
  const env = supabaseEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* A server component may not set cookies; only actions, route
             handlers and the middleware can. A refreshed session that could
             not be written here is written by the middleware on the next
             request, which is the documented arrangement, not a lost error. */
        }
      },
    },
  });
}

/**
 * Supabase as nobody in particular: what anyone holding a link may read.
 * No cookies are touched, so a page that only needs public rows does not
 * become a page that depends on who is looking.
 */
export function publicSupabase() {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient<Database>(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
