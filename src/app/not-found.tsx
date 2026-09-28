import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>nobody has claimed that handle yet.</h1>
      <p className={styles.lede}>
        canons live at <code>canon.so/&lt;handle&gt;</code>. this one is still empty.
      </p>
      <p className={styles.back}>
        <Link href="/">← back to the front</Link>
      </p>
    </main>
  );
}
