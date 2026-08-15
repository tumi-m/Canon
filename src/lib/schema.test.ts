import { describe, expect, it } from "vitest";
import { entrySchema, handleSchema, noteSchema, NOTE_MAX, WHY_MAX } from "./schema";
import { getCanon } from "./canon";

const work = {
  id: "x",
  kind: "youtube" as const,
  title: "a thing",
  url: "https://example.com/x",
  runtime: "6m",
};

describe("the character caps", () => {
  it("caps a why at 200", () => {
    expect(WHY_MAX).toBe(200);
    expect(entrySchema.safeParse({ work, why: "a".repeat(200), weight: 2 }).success).toBe(true);
    expect(entrySchema.safeParse({ work, why: "a".repeat(201), weight: 2 }).success).toBe(false);
  });

  it("caps a note at 300", () => {
    expect(NOTE_MAX).toBe(300);
    expect(noteSchema.safeParse({ body: "a".repeat(300) }).success).toBe(true);
    expect(noteSchema.safeParse({ body: "a".repeat(301) }).success).toBe(false);
  });

  it("rejects an empty why rather than storing a blank line", () => {
    expect(entrySchema.safeParse({ work, why: "", weight: 2 }).success).toBe(false);
  });
});

describe("weights", () => {
  it("takes only the three tiers", () => {
    for (const weight of [1, 2, 3]) {
      expect(entrySchema.safeParse({ work, why: "ok", weight }).success).toBe(true);
    }
    for (const weight of [0, 4, 2.5, "3"]) {
      expect(entrySchema.safeParse({ work, why: "ok", weight }).success).toBe(false);
    }
  });
});

describe("handles", () => {
  it("accepts the handles the DB constraint will accept", () => {
    for (const handle of ["tumelo", "abc", "a_b_9", "a".repeat(20)]) {
      expect(handleSchema.safeParse(handle).success).toBe(true);
    }
  });

  it("rejects what the DB constraint will reject", () => {
    for (const handle of ["ab", "a".repeat(21), "Tumelo", "with space", "dash-ed", ""]) {
      expect(handleSchema.safeParse(handle).success).toBe(false);
    }
  });
});

describe("the seed canon", () => {
  it("parses, so a bad seed fails at import and not in production", () => {
    const canon = getCanon("tumelo");
    expect(canon).toBeDefined();
    expect(canon!.entries.length).toBeGreaterThan(0);
  });

  it("is case-insensitive on the handle", () => {
    expect(getCanon("TUMELO")?.handle).toBe("tumelo");
  });

  it("returns undefined for a handle nobody has claimed", () => {
    expect(getCanon("nobody")).toBeUndefined();
  });
});
