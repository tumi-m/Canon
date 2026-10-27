"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { accountsEnabled } from "@/lib/supabase/env";

/** A session is a cookie Supabase sets; the one held during a sign-in is not a session yet. */
const hasSession = () =>
  document.cookie.split(/;\s*/).some((pair) => {
    const name = pair.split("=")[0] ?? "";
    return name.startsWith("sb-") && name.includes("-auth-token") && !name.includes("code-verifier");
  });
const unchanging = () => () => {};

/**
 * The way in, or back to your account, in the corner of the masthead.
 *
 * Decided in the browser from whether a session cookie is there, not asked
 * of the server: asking would make every canon page wait on the auth server
 * and stop being a static page. The cookie only chooses which link to show —
 * /account checks the session properly, and sends anyone it does not
 * believe to sign in.
 */
export default function AccountLink({ className }: { className?: string }) {
  const signedIn = useSyncExternalStore(unchanging, hasSession, () => null);
  if (!accountsEnabled() || signedIn === null) return null;
  return (
    <Link href={signedIn ? "/account" : "/signin"} className={className}>
      {signedIn ? "your account" : "sign in"}
    </Link>
  );
}
