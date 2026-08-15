"use client";

import { useState } from "react";
import type { Entry, Region } from "@/lib/schema";
import Room from "./room/Room";
import { DEFAULT_VENUE, VENUES, type VenueId } from "./room/venues";
import styles from "./RoomLauncher.module.css";

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
  label = "▶ step into the room",
}: {
  entries: readonly Entry[];
  region: Region;
  services: readonly string[];
  displayName: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [venue, setVenue] = useState<VenueId>(DEFAULT_VENUE);

  return (
    <>
      <div className={styles.row}>
        <button className={styles.button} onClick={() => setOpen(true)}>
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
      <p className={styles.blurb}>{VENUES.find((v) => v.id === venue)?.blurb}</p>
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
          }}
          onCapsule={() => {
            setOpen(false);
            setNote(
              "capsules stay sealed until the date they are addressed to. sealing one needs the database — that is M6.",
            );
          }}
        />
      ) : null}
    </>
  );
}
