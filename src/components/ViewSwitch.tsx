import Link from "next/link";
import { REGIONS } from "@/lib/availability";
import type { Region } from "@/lib/schema";
import styles from "./ViewSwitch.module.css";

/**
 * Where you are, and how you want to look at it.
 *
 * Both controls are plain links so the whole thing stays server-rendered and
 * shareable: a canon in a particular region, read a particular way, is a URL
 * you can send somebody.
 */
export default function ViewSwitch({
  handle,
  region,
  view,
}: {
  handle: string;
  region: Region;
  view: "wall" | "list";
}) {
  const href = (next: { region?: string; view?: string }) => {
    const params = new URLSearchParams();
    params.set("region", next.region ?? region);
    const v = next.view ?? view;
    if (v === "list") params.set("view", "list");
    return `/${handle}?${params.toString()}`;
  };

  return (
    /* The filled pill was the only sign of which view and which region were
       chosen — nothing a screen reader could hear. aria-current says it. */
    <div className={styles.bar}>
      <nav className={styles.group} aria-label="how to look at it">
        <Link
          href={href({ view: "wall" })}
          className={view === "wall" ? styles.on : styles.off}
          aria-current={view === "wall" ? "page" : undefined}
          scroll={false}
        >
          the wall
        </Link>
        <Link
          href={href({ view: "list" })}
          className={view === "list" ? styles.on : styles.off}
          aria-current={view === "list" ? "page" : undefined}
          scroll={false}
        >
          the list
        </Link>
      </nav>

      <nav className={styles.group} aria-label="where you are">
        <span className={styles.label} aria-hidden="true">
          where you are
        </span>
        {Object.entries(REGIONS).map(([code, name]) => (
          <Link
            key={code}
            href={href({ region: code })}
            className={code === region ? styles.on : styles.off}
            aria-current={code === region ? "true" : undefined}
            scroll={false}
          >
            {name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
