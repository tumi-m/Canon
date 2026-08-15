import type { Entry, Region } from "@/lib/schema";
import { WEIGHT_LABEL } from "@/lib/schema";
import { offersFor, regionName } from "@/lib/availability";
import styles from "./CanonList.module.css";

/**
 * The text view — the farza-shaped list this whole product is a defence of.
 * Server-rendered, no javascript required to read a canon.
 */
export default function CanonList({
  entries,
  region,
}: {
  entries: readonly Entry[];
  region: Region;
}) {
  return (
    <div className={styles.list}>
      {entries.map((entry) => {
        const offers = offersFor(entry.work.id, region);
        return (
          <article key={entry.work.id} className={styles.item}>
            <a
              className={`${styles.title} ${entry.weight === 3 ? styles.changed : ""}`}
              href={entry.work.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {entry.work.title}
            </a>
            <p className={styles.why}>{entry.why}</p>
            <div className={styles.meta}>
              <span>{entry.work.runtime}</span>
              <span>{WEIGHT_LABEL[entry.weight]}</span>
              {offers.length ? (
                offers.map((offer) => (
                  <a
                    key={offer.provider.id}
                    className={styles.offer}
                    style={{ background: offer.provider.colour }}
                    href={offer.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {offer.provider.name}
                  </a>
                ))
              ) : (
                <span className={styles.nowhere}>not streaming in {regionName(region)}</span>
              )}
              {/*
                plan §6: TMDB requires the JustWatch credit on every item that
                shows provider data, not once in a footer. It rides along with
                the offer so it cannot be dropped by a later refactor.
              */}
              {offers[0] ? <span className={styles.credit}>{offers[0].attribution}</span> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
