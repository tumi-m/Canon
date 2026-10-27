import Link from "next/link";
import styles from "./account.module.css";

/** Signing in, claiming a handle, the account: the same quiet page round each. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.wordmark}>
          canon<span className={styles.dot}>.</span>
        </Link>
      </header>
      {children}
    </main>
  );
}
