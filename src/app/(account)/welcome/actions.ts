"use server";

import { redirect } from "next/navigation";
import { claimSchema, regionFrom, safeNext } from "@/lib/account";
import { visitorCountry } from "@/lib/profiles";
import { serverSupabase } from "@/lib/supabase/server";

/**
 * Claiming a handle: the address of somebody's canon. The schema checks it
 * first so the message can be specific; the database checks it again, and
 * its unique constraint is the only thing that can say whether it is free.
 */
export async function claimHandle(form: FormData) {
  const rawHandle = String(form.get("handle") ?? "");
  const rawName = String(form.get("displayName") ?? "");
  const next = safeNext(form.get("next"));
  const again = (error: string) =>
    `/welcome?error=${error}&handle=${encodeURIComponent(rawHandle)}&name=${encodeURIComponent(rawName)}&next=${encodeURIComponent(next)}`;

  const parsed = claimSchema.safeParse({ handle: rawHandle, displayName: rawName });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const reserved = parsed.error.issues.some((issue) => issue.message === "that one is taken");
    redirect(again(field === "displayName" ? "name" : reserved ? "taken" : "handle"));
  }

  const supabase = await serverSupabase();
  if (!supabase) redirect("/signin");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/welcome");

  const { handle, displayName } = parsed.data;
  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    handle,
    display_name: displayName,
    region: regionFrom(await visitorCountry()),
  });
  if (error) {
    // the same person pressing twice already has their profile
    if (error.code === "23505" && error.message.includes("profiles_pkey")) redirect("/account");
    if (error.code === "23505") redirect(again("taken"));
    if (error.code === "23514") redirect(again("handle"));
    throw new Error(`could not claim /${handle}: ${error.message}`);
  }
  // straight to the canon they just made, unless they were on their way somewhere
  redirect(next === "/account" ? `/${handle}` : next);
}
