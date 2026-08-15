import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { allHandles, getCanon } from "@/lib/canon";
import { isKnownRegion, PROVIDERS, regionName } from "@/lib/availability";
import { formatMinutes, totalMinutes } from "@/lib/runtime";
import CanonList from "@/components/CanonList";
import RoomLauncher from "@/components/RoomLauncher";
import styles from "./page.module.css";

type Params = { handle: string };
type Search = { region?: string };

/** Every canon is static until M2 puts profiles in Postgres. */
export function generateStaticParams(): Params[] {
  return allHandles().map((handle) => ({ handle }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { handle } = await params;
  const canon = getCanon(handle);
  if (!canon) return { title: "canon. — not found" };
  return {
    title: `${canon.displayName}'s canon`,
    description: canon.bio,
    openGraph: { title: `${canon.displayName}'s canon`, description: canon.bio },
  };
}

export default async function CanonPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { handle } = await params;
  const { region: requested } = await searchParams;
  const canon = getCanon(handle);
  if (!canon) notFound();

  // region comes from the profile, overridable by the visitor
  const region =
    requested && isKnownRegion(requested) ? requested : canon.region;

  const runtime = formatMinutes(totalMinutes(canon.entries.map((e) => e.work.runtime)));
  const changed = canon.entries.filter((e) => e.weight === 3).length;

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.wordmark}>
          canon<span className={styles.dot}>.</span>
        </Link>
        <span className={styles.handle}>/{canon.handle}</span>
      </header>

      <section className={styles.intro}>
        <p className={styles.kicker}>the content that made</p>
        <h1 className={styles.name}>{canon.displayName}</h1>
        <p className={styles.bio}>{canon.bio}</p>

        <dl className={styles.stats}>
          <div>
            <dt>pieces</dt>
            <dd>{canon.entries.length}</dd>
          </div>
          <div>
            <dt>runtime</dt>
            <dd>{runtime}</dd>
          </div>
          <div>
            <dt>changed-me tier</dt>
            <dd>{changed}</dd>
          </div>
          <div>
            <dt>showing for</dt>
            <dd>{regionName(region)}</dd>
          </div>
        </dl>

        <div className={styles.cta}>
          <RoomLauncher
            entries={canon.entries}
            region={region}
            services={Object.keys(PROVIDERS)}
            displayName={canon.displayName}
          />
        </div>
      </section>

      <CanonList entries={canon.entries} region={region} handle={canon.handle} />

      <footer className={styles.footer}>
        <span>canon.</span>
        <span>streaming data via JustWatch / TMDB</span>
      </footer>
    </main>
  );
}
