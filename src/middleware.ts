import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Keeps a signed-in session alive: an access token lasts an hour, and this
 * is the one place a refreshed one can be written back to the browser before
 * a page reads it.
 *
 * Somebody with no session cookie has nothing to refresh, so for the visitor
 * who has never signed in — most of them — this does nothing and calls
 * nobody. A canon page should not wait on an auth server to be read.
 */
export async function middleware(request: NextRequest) {
  const env = supabaseEnv();
  const session = request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  if (!env || !session) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // asking who this is refreshes the token if it needs it
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // pages and actions; never the build's own files or images
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brands/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
