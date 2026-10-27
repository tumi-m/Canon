import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext, suggestHandle } from "@/lib/account";
import { currentAccount } from "@/lib/profiles";
import { accountsEnabled } from "@/lib/supabase/env";
import styles from "../account.module.css";
import { claimHandle } from "./actions";

export const metadata: Metadata = { title: "claim your canon — canon." };

const PROBLEMS: Record<string, string> = {
  taken: "that handle is taken. try another.",
  handle: "a handle is 3–20 letters, numbers or _.",
  name: "your canon needs a name on it.",
};

type Search = { next?: string; error?: string; handle?: string; name?: string };

export default async function Welcome({ searchParams }: { searchParams: Promise<Search> }) {
  const { next: requested, error, handle, name } = await searchParams;
  const next = safeNext(requested);
  if (!accountsEnabled()) redirect("/signin");

  const account = await currentAccount();
  if (!account) redirect("/signin?next=/welcome");
  if (account.profile) redirect("/account");

  // a first guess from what the provider told us; the person has the last word
  const meta = account.user.user_metadata as { full_name?: string; name?: string };
  const given = meta.full_name || meta.name || "";
  const handleValue = handle ?? suggestHandle(given, account.user.email);
  const nameValue = name ?? given;

  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>welcome</p>
      <h1 className={styles.title}>claim your canon</h1>
      <p className={styles.lede}>
        pick the address people will find it at, and the name that goes at the top of it.
      </p>

      {error ? (
        <p className={styles.alert} role="alert">
          {PROBLEMS[error] ?? "that didn't work. try again."}
        </p>
      ) : null}

      <form action={claimHandle} className={`${styles.form} ${styles.section}`}>
        <input type="hidden" name="next" value={next} />
        <label className={styles.field}>
          <span className={styles.label}>your handle</span>
          <span className={styles.prefixed}>
            <span className={styles.prefix} aria-hidden="true">
              canon.so/
            </span>
            {/* the browser checks the same rule the server and the database do */}
            <input
              className={styles.input}
              name="handle"
              defaultValue={handleValue}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              title="3–20 lowercase letters, numbers or _"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
            />
          </span>
          <span className={styles.hint}>3–20 lowercase letters, numbers or _. it can&apos;t be changed later, yet.</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>your name, as it goes on the canon</span>
          <input
            className={styles.input}
            name="displayName"
            defaultValue={nameValue}
            required
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <button className={styles.primary}>make my canon</button>
      </form>
    </section>
  );
}
