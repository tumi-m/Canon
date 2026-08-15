"use client";

import { useState } from "react";
import type { Entry, Region } from "@/lib/schema";
import Store from "./store/Store";
import styles from "./StoreLauncher.module.css";

/**
 * The store is an enhancement, never a requirement: the canon is fully
 * readable as a server-rendered list, and this only mounts the 3D shop when
 * someone asks for it. That also keeps the whole store out of the bundle
 * anyone who never opens it has to parse.
 */
export default function StoreLauncher({
  entries,
  region,
  services,
  label = "▶ walk into the store",
}: {
  entries: readonly Entry[];
  region: Region;
  services: readonly string[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <>
      <button className={styles.button} onClick={() => setOpen(true)}>
        {label}
      </button>
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
      {open ? (
        <Store
          entries={entries}
          region={region}
          services={services}
          onLeave={() => setOpen(false)}
          onBrowseList={() => {
            setOpen(false);
            setNote("same canon, plain list.");
          }}
          onBackRoom={() => {
            setOpen(false);
            setNote("the back room is members-only — memberships land in M7.");
          }}
        />
      ) : null}
    </>
  );
}
