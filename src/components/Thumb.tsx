"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * A thumbnail that admits when it is missing.
 *
 * The artwork is hotlinked from YouTube's CDN, which is out of our control: a
 * video can be deleted, made private, or region-blocked, and the endpoint then
 * answers with a placeholder or an error. Rather than leave a broken-image
 * glyph on somebody's wall, fall back to the title set large — the same
 * treatment a link with no video gets.
 */
export default function Thumb({
  src,
  title,
  imageClass,
  fallbackClass,
}: {
  src: string;
  title: string;
  /* css-module lookups are `string | undefined` under noUncheckedIndexedAccess */
  imageClass: string | undefined;
  fallbackClass: string | undefined;
}) {
  const [broken, setBroken] = useState(false);

  if (broken) return <span className={fallbackClass}>{title}</span>;

  return (
    <Image
      className={imageClass}
      src={src}
      alt=""
      width={480}
      height={360}
      /*
        `unoptimized` on purpose: the optimiser fetches server-side and
        YouTube's CDN answers that with a 403, which would break every
        thumbnail in production. This renders a plain <img>, so the browser
        hotlinks the CDN directly — what the endpoint is public for. hqdefault
        is already 480x360; there is nothing to resize.
      */
      unoptimized
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
