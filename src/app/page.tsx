import Link from "next/link";
import { allHandles, getCanon } from "@/lib/canon";
import styles from "./page.module.css";

export default function Home() {
  const handles = allHandles();
  // every title anybody keeps, for the shelf that runs along under the pitch
  const titles = handles.flatMap((handle) => getCanon(handle)?.entries.map((e) => e.work.title) ?? []);

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <span className={styles.wordmark}>
          canon<span className={styles.dot}>.</span>
          <span className={styles.cursor} />
        </span>
      </header>

      <section className={styles.hero}>
        <p className={styles.kicker}>a personal curated content network</p>
        <h1 className={styles.h1}>
          the content that <em>made you</em>
        </h1>
        <p className={styles.lede}>
          the films, videos, records and essays that actually changed you — each
          with a line on why, and where to watch it from where you are standing.
          a room you can walk into, shown to the people you invite, and left to
          the ones who come after. not a feed.
        </p>

        {titles.length ? (
          /* decoration made of the product: the real titles on the real
             shelves, drifting past. the canons themselves are listed below,
             so this is hidden from assistive tech rather than read twice. */
          <div className={styles.ticker} aria-hidden="true">
            <div className={styles.tickerTrack}>
              {[...titles, ...titles].map((title, i) => (
                <span key={i} className={styles.tickerItem}>
                  {title}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.canons}>
          {handles.map((handle) => {
            const canon = getCanon(handle);
            return (
              <Link key={handle} href={`/${handle}`} className={styles.canonLink}>
                <span className={styles.canonHandle}>canon.so/{handle}</span>
                <span className={styles.canonCount}>
                  {canon?.entries.length ?? 0} pieces →
                </span>
              </Link>
            );
          })}
        </div>

        <p className={styles.state}>
          early build. the canon, the availability layer and the walkable room
          are live. a canon is meant to be yours — shown to the people you
          invite, and left to the ones who come after — but nothing is locked
          yet: auth and the database are the next milestones.
        </p>
      </section>

      <footer className={styles.footer}>
        <span>canon.</span>
        <span>streaming data via JustWatch / TMDB</span>
      </footer>
    </main>
  );
}
