import Thumb from "./Thumb";
import type { Entry, Region } from "@/lib/schema";
import { WEIGHT_LABEL } from "@/lib/schema";
import { offersFor, regionName } from "@/lib/availability";
import { thumbnailForEntry } from "@/lib/youtube";
import styles from "./CanonGallery.module.css";

/**
 * The wall.
 *
 * The list is for reading; this is for looking. Image-led, quiet chrome, a lot
 * of air — and the *why* stays visible rather than hiding behind a hover,
 * because the annotation is the whole point of the product. Server-rendered
 * like everything else; no javascript required to look at somebody's taste.
 */
export default function CanonGallery({
  entries,
  region,
}: {
  entries: readonly Entry[];
  region: Region;
}) {
  return (
    <div className={styles.wall}>
      {entries.map((entry) => {
        const art = thumbnailForEntry(entry);
        const offers = offersFor(entry.work.id, region);
        return (
          <a
            key={entry.work.id}
            className={`${styles.tile} ${entry.weight === 3 ? styles.changed : ""}`}
            href={entry.work.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className={styles.frame}>
              {art ? (
                <Thumb
                  src={art}
                  title={entry.work.title}
                  imageClass={styles.art}
                  fallbackClass={styles.spine}
                />
              ) : (
                // a link with no video gets its title set large, like a spine
                <span className={styles.spine}>{entry.work.title}</span>
              )}
              <span className={styles.runtime}>{entry.work.runtime}</span>
            </div>

            <h3 className={styles.title}>{entry.work.title}</h3>
            <p className={styles.why}>{entry.why}</p>

            <div className={styles.meta}>
              <span className={styles.weight}>{WEIGHT_LABEL[entry.weight]}</span>
              {offers.length ? (
                <>
                  <span className={styles.where}>{offers.map((o) => o.provider.name).join(" · ")}</span>
                  {/* plan §6: the credit belongs on the item, not in a footer */}
                  <span className={styles.credit}>{offers[0]!.attribution}</span>
                </>
              ) : (
                <span className={styles.where}>not streaming in {regionName(region)}</span>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}
