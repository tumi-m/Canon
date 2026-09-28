"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Entry, Region } from "@/lib/schema";
import { DEFAULT_VENUE, VENUES, type VenueId } from "./room/venues";
import styles from "./RoomLauncher.module.css";

/** the room's code, fetched once: on the first hover, focus or press */
const loadRoom = () => import("./room/Room");

/*
 * Loaded on demand. A static import put three.js — most of the room's weight —
 * into the first load of every canon page, for every visitor, including the
 * ones who only ever read the list. The docblock below promised otherwise.
 */
const Room = dynamic(loadRoom, {
  ssr: false,
  // between the press and the code arriving: the same curtain the room uses
  loading: () => (
    <div className={styles.pending} role="status">
      opening the door…
    </div>
  ),
});

/**
 * The room is an enhancement, never a requirement: the canon is fully readable
 * as a server-rendered list, and this only mounts the 3D den when someone asks
 * for it. That also keeps the whole room out of the bundle anyone who never
 * opens it has to parse.
 */
export default function RoomLauncher({
  entries,
  region,
  services,
  displayName,
  listHref,
  label = "▶ step into the room",
}: {
  entries: readonly Entry[];
  region: Region;
  services: readonly string[];
  displayName: string;
  /** where "read it as a list" goes: this canon, this region, the list view */
  listHref: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [venue, setVenue] = useState<VenueId>(DEFAULT_VENUE);

  return (
    <>
      <div className={styles.row}>
        <button
          className={styles.button}
          onClick={() => setOpen(true)}
          // start fetching the room while the hand is still on its way
          onPointerEnter={() => void loadRoom()}
          onFocus={() => void loadRoom()}
        >
          {label}
        </button>
        <label className={styles.pick}>
          <span>where</span>
          <select value={venue} onChange={(e) => setVenue(e.target.value as VenueId)}>
            {VENUES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* keyed on the venue, so a new building's line fades in rather than snapping */}
      <p key={venue} className={styles.blurb}>
        {VENUES.find((v) => v.id === venue)?.blurb}
      </p>
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
      {open ? (
        <Room
          entries={entries}
          region={region}
          services={services}
          displayName={displayName}
          venue={venue}
          onVenue={setVenue}
          onLeave={() => setOpen(false)}
          onBrowseList={() => {
            setOpen(false);
            setNote("same shelves, read as a list.");
            /* it used to close the room onto whichever view was showing — the
               wall, usually — while the note said "read as a list" */
            router.push(listHref, { scroll: false });
            window.setTimeout(() => {
              document.getElementById("canon-view")?.scrollIntoView({ block: "start" });
            }, 60);
          }}
        />
      ) : null}
    </>
  );
}
