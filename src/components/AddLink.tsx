"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  DRAFTS_EVENT,
  entryFromLink,
  loadDrafts,
  newLinkSchema,
  saveDrafts,
  type Accepts,
  type NewLink,
} from "@/lib/drafts";
import { videoIdFrom } from "@/lib/youtube";
import { WEIGHT_LABEL, WHY_MAX, type Entry } from "@/lib/schema";
import { DEFAULT_SHELF_NAMES } from "./room/world";
import styles from "./AddLink.module.css";

/**
 * The drafts for one canon, kept in step across every view on the page — the
 * panel, the room, and any other tab — through one event and the storage
 * event browsers already fire between tabs.
 */
export function useDrafts(handle: string) {
  const [drafts, setDrafts] = useState<Entry[]>([]);

  useEffect(() => {
    const read = () => setDrafts(loadDrafts(handle));
    read();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.endsWith(handle)) read();
    };
    window.addEventListener(DRAFTS_EVENT, read);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DRAFTS_EVENT, read);
      window.removeEventListener("storage", onStorage);
    };
  }, [handle]);

  const add = useCallback(
    (link: ReturnType<typeof newLinkSchema.parse>) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      return saveDrafts(handle, [...loadDrafts(handle), entryFromLink(link, id)]);
    },
    [handle],
  );

  const remove = useCallback(
    (id: string) => saveDrafts(handle, loadDrafts(handle).filter((d) => d.work.id !== id)),
    [handle],
  );

  return { drafts, add, remove };
}

/** Where a new piece can go: the four shelves, in the building's own words. */
const choices = (names: readonly string[]): { name: string; accepts: Accepts }[] => [
  { name: names[0] ?? DEFAULT_SHELF_NAMES[0], accepts: { weight: 3, highlighted: false } },
  { name: names[1] ?? DEFAULT_SHELF_NAMES[1], accepts: { weight: 3, highlighted: true } },
  { name: names[2] ?? DEFAULT_SHELF_NAMES[2], accepts: { weight: 2, highlighted: false } },
  { name: names[3] ?? DEFAULT_SHELF_NAMES[3], accepts: { weight: 1, highlighted: false } },
];

const same = (a: Accepts, b: Accepts) => a.weight === b.weight && a.highlighted === b.highlighted;

/**
 * Add something to a canon: a link, what it is called, why it is here, and
 * which shelf. Validated with the same schema the real write will use, so
 * what is refused here will be refused there.
 */
export function AddLinkForm({
  tone = "paper",
  accepts = { weight: 3, highlighted: false },
  shelfNames = DEFAULT_SHELF_NAMES,
  onSave,
  onClose,
}: {
  /** "room" draws it for the dark, over the 3d room */
  tone?: "paper" | "room";
  /** the shelf it starts on — the one whose sign you were looking at */
  accepts?: Accepts;
  shelfNames?: readonly string[];
  /** returns false if it could not be kept */
  onSave: (link: ReturnType<typeof newLinkSchema.parse>) => boolean;
  onClose: () => void;
}) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [runtime, setRuntime] = useState("");
  const [shelf, setShelf] = useState<Accepts>(accepts);
  const [errors, setErrors] = useState<Partial<Record<keyof NewLink | "form", string>>>({});
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);

  const video = videoIdFrom(url.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = newLinkSchema.safeParse({
      url: url.trim(),
      title,
      why,
      weight: shelf.weight,
      highlighted: shelf.highlighted,
      runtime: runtime.trim() || undefined,
    });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof NewLink | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    if (!onSave(parsed.data)) {
      setErrors({ form: "this browser would not keep it — private browsing, perhaps" });
      return;
    }
    onClose();
  };

  const field = (name: keyof NewLink) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });
  const error = (name: keyof NewLink | "form") =>
    errors[name] ? (
      <p id={`${id}-${name}-error`} className={styles.error} role="alert">
        {errors[name]}
      </p>
    ) : null;

  return (
    <div
      className={`${styles.backdrop} ${tone === "room" ? styles.room : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <form className={styles.card} onSubmit={submit} noValidate>
        <p className={styles.kicker}>a draft · kept in this browser</p>
        <h2 id={`${id}-title`} className={styles.heading}>
          add something to the shelves
        </h2>

        <label className={styles.label} htmlFor={`${id}-url`}>
          the link
        </label>
        <input
          ref={first}
          id={`${id}-url`}
          className={styles.input}
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          {...field("url")}
        />
        {error("url")}
        {video ? <p className={styles.hint}>a youtube video — it will play on the set in the room</p> : null}

        <label className={styles.label} htmlFor={`${id}-title-input`}>
          what it is called
        </label>
        <input
          id={`${id}-title-input`}
          className={styles.input}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          {...field("title")}
        />
        {error("title")}

        <label className={styles.label} htmlFor={`${id}-why`}>
          why it is here
          <span className={styles.count} aria-hidden="true">
            {why.length}/{WHY_MAX}
          </span>
        </label>
        <textarea
          id={`${id}-why`}
          className={styles.textarea}
          rows={3}
          maxLength={WHY_MAX}
          placeholder="one line. what it did to you."
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          {...field("why")}
        />
        {error("why")}

        <fieldset className={styles.shelves}>
          <legend className={styles.label}>which shelf</legend>
          {choices(shelfNames).map((choice) => (
            <label
              key={choice.name}
              className={`${styles.shelf} ${same(choice.accepts, shelf) ? styles.shelfOn : ""}`}
            >
              <input
                type="radio"
                name={`${id}-shelf`}
                checked={same(choice.accepts, shelf)}
                onChange={() => setShelf(choice.accepts)}
              />
              {choice.name}
            </label>
          ))}
        </fieldset>

        <label className={styles.label} htmlFor={`${id}-runtime`}>
          how long <span className={styles.optional}>optional</span>
        </label>
        <input
          id={`${id}-runtime`}
          className={`${styles.input} ${styles.short}`}
          placeholder="1hr 47m"
          value={runtime}
          maxLength={20}
          onChange={(e) => setRuntime(e.target.value)}
          {...field("runtime")}
        />
        {error("runtime")}
        {error("form")}

        <p className={styles.note}>
          until sign-in exists this stays in this browser, marked as a draft — nobody else can
          see it. when accounts arrive it moves into your canon.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            cancel
          </button>
          <button type="submit" className={styles.primary}>
            put it on the shelf
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * On the canon page: the way to add something, and what has been added on
 * this device so far — each one plainly a draft, and each one removable.
 */
export function DraftShelf({ handle }: { handle: string }) {
  const { drafts, add, remove } = useDrafts(handle);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  return (
    <section className={styles.panel} aria-labelledby={`drafts-${handle}`}>
      <div className={styles.panelHead}>
        <h2 id={`drafts-${handle}`} className={styles.panelTitle}>
          on this device
          {drafts.length ? <span className={styles.panelCount}>{drafts.length}</span> : null}
        </h2>
        <button ref={opener} className={styles.addButton} onClick={() => setOpen(true)}>
          + add a link
        </button>
      </div>
      {drafts.length ? (
        <ul className={styles.drafts}>
          {drafts.map((d) => (
            <li key={d.work.id} className={styles.draft}>
              <span className={styles.badge}>draft</span>
              <a href={d.work.url} target="_blank" rel="noopener noreferrer" className={styles.draftTitle}>
                {d.work.title}
              </a>
              <span className={styles.draftWhy}>{d.why}</span>
              <span className={styles.draftShelf}>
                {d.highlighted ? DEFAULT_SHELF_NAMES[1] : WEIGHT_LABEL[d.weight]}
              </span>
              <button
                className={styles.remove}
                onClick={() => remove(d.work.id)}
                aria-label={`remove ${d.work.title}`}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          paste a link — a video, a film, a record, an essay — and say why. it goes on the
          shelves here and in the room, kept in this browser until sign-in exists.
        </p>
      )}
      {open ? (
        <AddLinkForm
          onSave={add}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      ) : null}
    </section>
  );
}
