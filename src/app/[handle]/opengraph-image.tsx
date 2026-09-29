import { ImageResponse } from "next/og";
import { allHandles, getCanon } from "@/lib/canon";

/**
 * The card a canon unfurls as when somebody sends the link.
 *
 * Canon travels by being sent — to family, to the people you invite — and a
 * link that unfurled as a bare title said nothing about whose it was or what
 * was in it. This one carries the name, the line they wrote, and the pieces
 * that changed them.
 */

export const alt = "somebody's canon: the content that made them";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return allHandles().map((handle) => ({ handle }));
}

/*
 * An image drawn on the server cannot read css custom properties, so these
 * are the values of the tokens in globals.css — --paper, --ink, --ink-soft,
 * --red and --line — copied, not invented. Change them together.
 */
const PAPER = "#faf6ee";
const INK = "#1b1712";
const INK_SOFT = "#5c544a";
const RED = "#c8402a";
const LINE = "#e3dccd";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const canon = getCanon(handle);
  const changed = canon?.entries.filter((e) => e.weight === 3).slice(0, 3) ?? [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 76px",
          background: PAPER,
          color: INK,
        }}
      >
        <div style={{ display: "flex", fontSize: 34, letterSpacing: -1 }}>
          canon<span style={{ color: RED }}>.</span>
          <span style={{ marginLeft: 14, color: INK_SOFT, fontSize: 24, marginTop: 8 }}>
            /{handle}
          </span>
        </div>

        <div style={{ display: "flex", marginTop: 44, fontSize: 20, letterSpacing: 5, color: RED }}>
          THE CONTENT THAT MADE
        </div>
        <div style={{ display: "flex", fontSize: 96, letterSpacing: -3, lineHeight: 1 }}>
          {canon?.displayName ?? handle}
        </div>
        {canon?.bio ? (
          <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: INK_SOFT, maxWidth: 900 }}>
            {canon.bio}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            borderTop: `2px solid ${LINE}`,
            paddingTop: 22,
          }}
        >
          {changed.map((entry) => (
            <div
              key={entry.work.id}
              style={{ display: "flex", alignItems: "center", fontSize: 26, marginBottom: 6 }}
            >
              {/* drawn, not typed: the bundled font has no bullet, and a
                  missing glyph sends the renderer off to fetch one */}
              <div
                style={{ width: 12, height: 12, borderRadius: 6, background: RED, marginRight: 16 }}
              />
              {entry.work.title}
            </div>
          ))}
          <div style={{ display: "flex", marginTop: 10, fontSize: 20, color: INK_SOFT }}>
            {canon ? `${canon.entries.length} pieces · the ones that changed them, first` : ""}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
