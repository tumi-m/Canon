import { describe, expect, it } from "vitest";
import {
  audienceSchema,
  capsuleSchema,
  entrySchema,
  handleSchema,
  noteSchema,
  NOTE_MAX,
  profileSchema,
  shelfSchema,
  WHY_MAX,
} from "./schema";
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

describe("who gets in", () => {
  it("defaults a room to the people you invite, not the internet", () => {
    const parsed = profileSchema.parse({
      handle: "someone",
      displayName: "someone",
      bio: "",
      region: "nz",
      entries: [],
    });
    expect(parsed.audience).toBe("invited");
  });

  it("takes only the four audiences", () => {
    for (const a of ["private", "invited", "household", "everyone"]) {
      expect(audienceSchema.safeParse(a).success).toBe(true);
    }
    for (const a of ["public", "followers", "", "INVITED"]) {
      expect(audienceSchema.safeParse(a).success).toBe(false);
    }
  });
});

describe("a capsule", () => {
  const base = {
    title: "for when you are eighteen",
    message: "the things that made me, in case they help.",
    opensAt: new Date("2044-01-01"),
    addressedTo: ["someone@example.com"],
  };

  it("must be addressed to somebody", () => {
    expect(capsuleSchema.safeParse(base).success).toBe(true);
    expect(capsuleSchema.safeParse({ ...base, addressedTo: [] }).success).toBe(false);
    expect(capsuleSchema.safeParse({ ...base, addressedTo: ["not an email"] }).success).toBe(false);
  });

  it("holds its message to the same 300 characters as a note", () => {
    expect(capsuleSchema.safeParse({ ...base, message: "a".repeat(NOTE_MAX) }).success).toBe(true);
    expect(capsuleSchema.safeParse({ ...base, message: "a".repeat(NOTE_MAX + 1) }).success).toBe(
      false,
    );
  });

  it("is optional on a shelf — most shelves are not capsules", () => {
    expect(shelfSchema.safeParse({ name: "the good shelf", audience: "invited" }).success).toBe(true);
    expect(
      shelfSchema.safeParse({ name: "for my daughter", audience: "private", capsule: base }).success,
    ).toBe(true);
  });
});
