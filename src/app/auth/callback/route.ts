import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/lib/account";
import { serverSupabase } from "@/lib/supabase/server";

/**
 * Where Google, Apple and the email link send people back to.
 *
 * A provider comes back with a one-time `code`, exchanged here for a session
 * (stored in cookies). An email link comes back the same way — or, if the
 * project's email template is set to the server-side flow, with a
 * `token_hash`, which works even when the link is opened in a different
 * browser from the one that asked for it.
 *
 * Somebody signing in for the first time has no handle yet, so they are sent
 * to claim one before anything else.
 */

const OTP_TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  const supabase = await serverSupabase();
  if (!supabase) return to("/signin");

  // the provider said no, or the person said no to the provider
  if (url.searchParams.get("error")) return to(`/signin?error=denied&next=${encodeURIComponent(next)}`);

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let failure: string | null = "no code";
  if (code) {
    failure = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    failure = (await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error?.message ?? null;
  }
  if (failure) {
    console.error("the sign-in callback did not complete:", failure);
    return to(`/signin?error=link&next=${encodeURIComponent(next)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return to(`/signin?error=link&next=${encodeURIComponent(next)}`);
  const { data: profile, error } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  if (error) throw new Error(`could not read the profile for ${user.id}: ${error.message}`);
  return to(profile ? next : `/welcome?next=${encodeURIComponent(next)}`);
}
