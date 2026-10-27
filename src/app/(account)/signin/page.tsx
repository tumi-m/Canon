import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/account";
import { currentAccount } from "@/lib/profiles";
import { accountsEnabled } from "@/lib/supabase/env";
import styles from "../account.module.css";
import { continueWith, emailLink } from "./actions";

export const metadata: Metadata = { title: "sign in — canon." };

/** what went wrong, said plainly, with what to do about it */
const PROBLEMS: Record<string, string> = {
  provider: "that sign-in didn't start. try again, or use another way in.",
  denied: "sign-in was cancelled — nothing was shared.",
  link: "that link has expired or was already used. send yourself a new one.",
  email: "that doesn't look like an email address.",
  send: "the email couldn't be sent just now. wait a minute and try again.",
};

type Search = { next?: string; error?: string; sent?: string };

export default async function SignIn({ searchParams }: { searchParams: Promise<Search> }) {
  const { next: requested, error, sent } = await searchParams;
  const next = safeNext(requested);

  if (!accountsEnabled()) {
    // the honest state of a copy of canon that has no database behind it yet
    return (
      <section className={styles.panel}>
        <p className={styles.kicker}>accounts</p>
        <h1 className={styles.title}>not switched on yet</h1>
        <p className={styles.lede}>
          this copy of canon has no accounts behind it, so there is nothing to sign in to. every
          canon and the room still work, and anything you add is kept as a draft on this device.
        </p>
        <p className={styles.fine}>
          <Link href="/" className={styles.link}>
            ← back to the front
          </Link>
        </p>
      </section>
    );
  }

  const account = await currentAccount();
  if (account) redirect(account.profile ? next : `/welcome?next=${encodeURIComponent(next)}`);

  return (
    <section className={styles.panel}>
      <p className={styles.kicker}>your canon</p>
      <h1 className={styles.title}>sign in</h1>
      <p className={styles.lede}>
        the content that made you, kept somewhere that is yours. new here? signing in is how you
        start one.
      </p>

      {sent ? (
        <p className={styles.notice} role="status">
          check your email. the link in it signs you in on this device.
        </p>
      ) : null}
      {error ? (
        <p className={styles.alert} role="alert">
          {PROBLEMS[error] ?? "something went wrong signing in. try again."}
        </p>
      ) : null}

      {/* one form, two buttons: whichever is pressed says which provider.
          the labels are the providers' own wording, as their guidelines ask */}
      <form action={continueWith} className={styles.ways}>
        <input type="hidden" name="next" value={next} />
        <button className={`${styles.provider} ${styles.google}`} name="provider" value="google">
          {/* eslint-disable-next-line @next/next/no-img-element -- a provider's mark, as a fixed asset */}
          <img src="/brands/google.svg" alt="" width={18} height={18} />
          Continue with Google
        </button>
        <button className={`${styles.provider} ${styles.apple}`} name="provider" value="apple">
          {/* eslint-disable-next-line @next/next/no-img-element -- a provider's mark, as a fixed asset */}
          <img src="/brands/apple.svg" alt="" width={18} height={18} />
          Continue with Apple
        </button>
      </form>

      <p className={styles.or}>or</p>

      <form action={emailLink} className={styles.form}>
        <input type="hidden" name="next" value={next} />
        <label className={styles.field}>
          <span className={styles.label}>email me a link</span>
          <input
            className={styles.input}
            type="email"
            name="email"
            required
            maxLength={320}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <button className={styles.primary}>send the link</button>
      </form>

      <p className={styles.fine}>
        no password to remember. your email is used to sign you in, and for nothing else.
      </p>
    </section>
  );
}
