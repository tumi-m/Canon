import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { REGIONS } from "@/lib/availability";
import { currentAccount } from "@/lib/profiles";
import { accountsEnabled } from "@/lib/supabase/env";
import styles from "../account.module.css";
import { signOut, updateProfile } from "./actions";

export const metadata: Metadata = { title: "your account — canon." };

const PROVIDER_NAME: Record<string, string> = { google: "Google", apple: "Apple", email: "an email link" };

type Search = { saved?: string; error?: string };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { saved, error } = await searchParams;
  if (!accountsEnabled()) redirect("/signin");
  const account = await currentAccount();
  if (!account) redirect("/signin?next=/account");
  const { user, profile } = account;
  if (!profile) redirect("/welcome");

  const providers = ((user.app_metadata.providers as string[] | undefined) ?? [user.app_metadata.provider as string])
    .filter(Boolean)
    .map((p) => PROVIDER_NAME[p] ?? p);
  const since = new Date(profile.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>your account</p>
      <h1 className={styles.title}>{profile.display_name}</h1>
      <p className={styles.lede}>
        your canon is at{" "}
        <Link href={`/${profile.handle}`} className={styles.link}>
          canon.so/{profile.handle}
        </Link>
      </p>

      {saved ? (
        <p className={styles.notice} role="status">
          saved.
        </p>
      ) : null}
      {error ? (
        <p className={styles.alert} role="alert">
          a name is 1–80 characters and the line under it at most 200.
        </p>
      ) : null}

      <dl className={styles.facts}>
        <dt>signed in with</dt>
        <dd>{providers.join(", ") || "—"}</dd>
        <dt>email</dt>
        <dd>{user.email ?? "—"}</dd>
        <dt>since</dt>
        <dd>{since}</dd>
      </dl>

      <form action={updateProfile} className={`${styles.form} ${styles.section}`}>
        <label className={styles.field}>
          <span className={styles.label}>name</span>
          <input className={styles.input} name="displayName" defaultValue={profile.display_name} required maxLength={80} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>the line under it</span>
          <textarea className={styles.textarea} name="bio" defaultValue={profile.bio} maxLength={200} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>where you watch from</span>
          <select className={styles.select} name="region" defaultValue={profile.region}>
            {Object.entries(REGIONS).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button className={styles.primary}>save</button>
      </form>

      <form action={signOut} className={styles.section}>
        <button className={styles.secondary}>sign out</button>
      </form>

      <p className={styles.fine}>
        shelves come next. until they do, what you add on your canon is kept as a draft on the
        device you added it from.
      </p>
    </section>
  );
}
