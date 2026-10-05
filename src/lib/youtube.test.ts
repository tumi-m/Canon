import { describe, expect, it } from "vitest";
import {
  channelLabel,
  channelsFrom,
  embedUrl,
  surf,
  thumbnailFor,
  thumbnailForEntry,
  videoIdFrom,
} from "./youtube";
import { getCanon } from "./canon";
import type { Entry } from "./schema";

describe("videoIdFrom", () => {
  it("reads every link shape people actually paste", () => {
    const id = "7vWSi44ZTSw";
    for (const input of [
      id,
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=90s`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
    ]) {
      expect(videoIdFrom(input), input).toBe(id);
    }
  });

  it("returns null rather than guessing", () => {
    for (const input of [
      "",
      "not a url",
      "https://example.com/watch?v=7vWSi44ZTSw",
      "https://www.youtube.com/watch?v=tooshort",
      "https://www.youtube.com/",
      "https://en.wikipedia.org/wiki/Senna_(film)",
      "https://vimeo.com/12345",
    ]) {
      expect(videoIdFrom(input), input).toBeNull();
    }
  });
});

describe("embedUrl", () => {
  const id = "7vWSi44ZTSw";

  it("uses the privacy host and the official embed path", () => {
    expect(embedUrl(id)).toContain("https://www.youtube-nocookie.com/embed/" + id);
  });

  it("starts muted, because browsers block autoplay with sound", () => {
    expect(embedUrl(id)).toContain("mute=1");
    expect(embedUrl(id, { muted: false })).toContain("mute=0");
  });

  it("turns off the related-video grid — this is a shelf, not a feed", () => {
    expect(embedUrl(id)).toContain("rel=0");
  });
});

describe("channelsFrom", () => {
  const entries = getCanon("tumelo")!.entries;

  it("gives a channel only to what can actually be embedded", () => {
    const channels = channelsFrom(entries);
    expect(channels.length).toBeGreaterThan(0);
    expect(channels.length).toBeLessThan(entries.length); // the wikipedia links have none
    for (const channel of channels) {
      expect(entries[channel.entryIndex]?.work.title).toBe(channel.title);
    }
  });

  it("numbers channels from one, with no gaps", () => {
    const numbers = channelsFrom(entries).map((c) => c.number);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("finds an id in the url when the entry has no explicit one", () => {
    const entry: Entry = {
      work: {
        id: "x",
        kind: "youtube",
        title: "t",
        url: "https://youtu.be/7vWSi44ZTSw",
        runtime: "1m",
      },
      why: "because",
      weight: 2,
      highlighted: false,
    };
    expect(channelsFrom([entry])[0]?.videoId).toBe("7vWSi44ZTSw");
  });

  it("is empty for a canon of nothing but links", () => {
    const entry: Entry = {
      work: { id: "x", kind: "film", title: "t", url: "https://en.wikipedia.org/wiki/X", runtime: "2hr" },
      why: "because",
      weight: 2,
      highlighted: false,
    };
    expect(channelsFrom([entry])).toEqual([]);
  });
});

describe("surf", () => {
  const channels = channelsFrom(getCanon("tumelo")!.entries);

  it("wraps around in both directions, like a real dial", () => {
    expect(surf(channels, channels.length - 1, 1)).toBe(0);
    expect(surf(channels, 0, -1)).toBe(channels.length - 1);
    expect(surf(channels, 0, 1)).toBe(1);
  });

  it("does not divide by zero on an empty dial", () => {
    expect(surf([], 0, 1)).toBe(0);
  });
});

describe("channelLabel", () => {
  it("pads to the two digits a tuner shows", () => {
    expect(channelLabel(0)).toBe("CH 01");
    expect(channelLabel(11)).toBe("CH 12");
  });
});

describe("thumbnails", () => {
  it("points at youtube's own cdn, never a copy of ours", () => {
    expect(thumbnailFor("7vWSi44ZTSw")).toBe("https://i.ytimg.com/vi/7vWSi44ZTSw/hqdefault.jpg");
  });

  it("finds artwork for an embeddable entry and admits there is none otherwise", () => {
    const yt = { work: { youtubeId: "7vWSi44ZTSw", url: "https://youtu.be/7vWSi44ZTSw" } };
    const link = { work: { url: "https://en.wikipedia.org/wiki/Senna_(film)" } };
    expect(thumbnailForEntry(yt)).toContain("i.ytimg.com");
    expect(thumbnailForEntry(link)).toBeNull();
  });
});
