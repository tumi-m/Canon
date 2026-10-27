"use server";

import { redirect } from "next/navigation";
import { callbackUrl, emailSchema, providerSchema, safeNext } from "@/lib/account";
import { siteOrigin } from "@/lib/profiles";
import { serverSupabase } from "@/lib/supabase/server";

const back = (error: string, next: string) => `/signin?error=${error}&next=${encodeURIComponent(next)}`;

/**
 * Off to Google or Apple. Supabase hands back the provider's own sign-in
 * page, already carrying where to come back to; the code it returns with is
 * exchanged in /auth/callback.
 */
export async function continueWith(form: FormData) {
  const next = safeNext(form.get("next"));
  const provider = providerSchema.safeParse(form.get("provider"));
  const supabase = await serverSupabase();
  if (!supabase) redirect("/signin");
  if (!provider.success) redirect(back("provider", next));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.data,
    options: { redirectTo: callbackUrl(await siteOrigin(), next) },
  });
  if (error || !data.url) {
    console.error(`sign-in with ${provider.data} did not start:`, error?.message ?? "no url");
    redirect(back("provider", next));
  }
  redirect(data.url);
}

/**
 * A link by email: for anyone without Google or Apple, or who would rather
 * not use them. The link signs you in on the device you asked from.
 */
export async function emailLink(form: FormData) {
  const next = safeNext(form.get("next"));
  const email = emailSchema.safeParse(form.get("email"));
  const supabase = await serverSupabase();
  if (!supabase) redirect("/signin");
  if (!email.success) redirect(back("email", next));

  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: callbackUrl(await siteOrigin(), next) },
  });
  if (error) {
    console.error("the sign-in email was not sent:", error.message);
    redirect(back("send", next));
  }
  // the address itself stays out of the url, and out of history and logs
  redirect(`/signin?sent=1&next=${encodeURIComponent(next)}`);
}
