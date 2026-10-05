import { describe, expect, it } from "vitest";
import { entryFromLink, isDraft, kindFromUrl, newLinkSchema, parseStored } from "./drafts";
import { WHY_MAX } from "./schema";

const good = {
  url: "https://www.youtube.com/watch?v=THjekE5p2aw",
  title: "second sky",
  why: "what it looks like when someone survives their own art.",
  weight: 3,
};

describe("newLinkSchema", () => {
  it("takes a link, a title, a why and a shelf", () => {
    expect(newLinkSchema.safeParse(good).success).toBe(true);
  });

  it("refuses anything that is not a web link", () => {
    for (const url of ["not a link", "javascript:alert(1)", "ftp://example.com/x", "data:text/html,hi"]) {
      expect(newLinkSchema.safeParse({ ...good, url }).success, url).toBe(false);
    }
  });

  it("will not take a piece without a why", () => {
    expect(newLinkSchema.safeParse({ ...good, why: "   " }).success).toBe(false);
  });

  it("caps the why at the same number the database will", () => {
    expect(newLinkSchema.safeParse({ ...good, why: "x".repeat(WHY_MAX) }).success).toBe(true);
    expect(newLinkSchema.safeParse({ ...good, why: "x".repeat(WHY_MAX + 1) }).success).toBe(false);
  });

  it("only knows three shelves", () => {
    expect(newLinkSchema.safeParse({ ...good, weight: 4 }).success).toBe(false);
  });
});

describe("kindFromUrl", () => {
  it("knows youtube, films, music and reading", () => {
    expect(kindFromUrl("https://youtu.be/THjekE5p2aw")).toBe("youtube");
    expect(kindFromUrl("https://letterboxd.com/film/senna/")).toBe("film");
    expect(kindFromUrl("https://open.spotify.com/album/x")).toBe("music");
    expect(kindFromUrl("https://en.wikipedia.org/wiki/Jiro")).toBe("article");
    expect(kindFromUrl("https://example.com")).toBe("other");
  });
});

describe("entryFromLink", () => {
  it("makes a draft shaped exactly like a saved entry, with its video id", () => {
    const entry = entryFromLink(newLinkSchema.parse(good), "abc");
    expect(isDraft(entry)).toBe(true);
    expect(entry.work.youtubeId).toBe("THjekE5p2aw");
    expect(entry.work.runtime).toBe("—");
    expect(entry.weight).toBe(3);
  });
});

describe("parseStored", () => {
  const draft = entryFromLink(newLinkSchema.parse(good), "abc");

  it("reads back what was saved", () => {
    expect(parseStored(JSON.stringify([draft]))).toEqual([draft]);
  });

  it("drops anything storage hands back that is not a valid draft", () => {
    const tampered = { ...draft, why: "x".repeat(WHY_MAX + 5) };
    const notADraft = { ...draft, work: { ...draft.work, id: "tumelo-1" } };
    expect(parseStored(JSON.stringify([draft, tampered, notADraft, 42]))).toEqual([draft]);
  });

  it("treats garbage as no drafts at all", () => {
    for (const raw of [null, "", "{", "{}", "null"]) expect(parseStored(raw)).toEqual([]);
  });
});
