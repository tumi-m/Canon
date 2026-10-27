import type { Entry, Region } from "@/lib/schema";
import { WEIGHT_LABEL } from "@/lib/schema";
import { offersFor, regionName } from "@/lib/availability";
import { DEFAULT_SHELF_NAMES } from "./room/world";
import styles from "./CanonList.module.css";

/**
 * The shelves the room puts things on, read top to bottom. A list that ran
 * all sixteen pieces together lost the one piece of structure a canon has —
 * which of these actually changed you — and disagreed with the room about
 * what goes where.
 */
const SHELVES = [
  { weight: 3, name: DEFAULT_SHELF_NAMES[0] },
  { weight: 2, name: DEFAULT_SHELF_NAMES[2] },
  { weight: 1, name: DEFAULT_SHELF_NAMES[3] },
] as const;

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
      {SHELVES.map((shelf) => {
        const stocked = entries.filter((e) => e.weight === shelf.weight);
        if (stocked.length === 0) return null;
        const id = `shelf-${shelf.weight}`;
        return (
          <section key={shelf.weight} className={styles.shelf} aria-labelledby={id}>
            <h2 id={id} className={styles.shelfName}>
              {shelf.name}
              <span className={styles.shelfCount}>{stocked.length}</span>
            </h2>
            {stocked.map((entry) => (
              <Item key={entry.work.id} entry={entry} region={region} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Item({ entry, region }: { entry: Entry; region: Region }) {
  const offers = offersFor(entry.work.id, region);
  return (
    <article className={styles.item}>
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
}
