"use server";

import { redirect } from "next/navigation";
import { profileEditSchema } from "@/lib/account";
import { serverSupabase } from "@/lib/supabase/server";

/** The front page of somebody's canon: their name, their line, their region. */
export async function updateProfile(form: FormData) {
  const parsed = profileEditSchema.safeParse({
    displayName: form.get("displayName"),
    bio: form.get("bio") ?? "",
    region: form.get("region"),
  });
  if (!parsed.success) redirect("/account?error=invalid");

  const supabase = await serverSupabase();
  if (!supabase) redirect("/signin");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/account");

  // row level security only lets this touch their own row; the filter says which
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, bio: parsed.data.bio, region: parsed.data.region })
    .eq("id", user.id);
  if (error) throw new Error(`could not save the profile for ${user.id}: ${error.message}`);
  redirect("/account?saved=1");
}

export async function signOut() {
  const supabase = await serverSupabase();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(`could not sign out: ${error.message}`);
  }
  redirect("/");
}
