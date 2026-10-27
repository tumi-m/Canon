import { describe, expect, it } from "vitest";
import {
  callbackUrl,
  claimHandleSchema,
  claimSchema,
  emailSchema,
  isReserved,
  profileEditSchema,
  providerSchema,
  regionFrom,
  safeNext,
  suggestHandle,
} from "./account";

describe("where a sign-in may send you afterwards", () => {
  it("refuses anywhere that is not plainly a path on this site", () => {
    // each of these has been used to turn a sign-in page into a phishing link
    for (const hostile of [
      "https://evil.example",
      "//evil.example",
      "//evil.example/account",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "evil.example",
      "/%0d%0aLocation:https://evil.example".replace("%0d%0a", "\r\n"),
      "/account\u0000",
      "",
      42,
      null,
      undefined,
      "/" + "a".repeat(600),
    ]) {
      expect(safeNext(hostile), String(hostile)).toBe("/account");
    }
  });

  it("keeps a local path, with its query and fragment", () => {
    expect(safeNext("/tumelo")).toBe("/tumelo");
    expect(safeNext("/tumelo?view=list&region=za#canon-view")).toBe("/tumelo?view=list&region=za#canon-view");
    expect(safeNext("/welcome")).toBe("/welcome");
  });

  it("can fall back somewhere other than the account", () => {
    expect(safeNext("//evil.example", "/")).toBe("/");
  });

  it("carries the destination through the provider and back", () => {
    expect(callbackUrl("https://canon.so", "/tumelo?view=list")).toBe(
      "https://canon.so/auth/callback?next=%2Ftumelo%3Fview%3Dlist",
    );
    expect(callbackUrl("https://canon.so", "//evil.example")).toBe("https://canon.so/auth/callback?next=%2Faccount");
  });
});

describe("a handle", () => {
  it("is taken as typed, then lowercased and trimmed", () => {
    expect(claimHandleSchema.parse("  Tumi_M  ")).toBe("tumi_m");
  });

  it("is 3–20 of a–z, 0–9 and _", () => {
    for (const bad of ["ab", "a".repeat(21), "tu mi", "tumi-m", "tümi", "tumi.m", ""]) {
      expect(claimHandleSchema.safeParse(bad).success, bad).toBe(false);
    }
    for (const good of ["abc", "a".repeat(20), "tumi_m", "x_1"]) {
      expect(claimHandleSchema.safeParse(good).success, good).toBe(true);
    }
  });

  it("cannot be a page of the site, or a canon that is already showing", () => {
    for (const taken of ["signin", "account", "welcome", "auth", "api", "tumelo", "ACCOUNT"]) {
      expect(claimHandleSchema.safeParse(taken).success, taken).toBe(false);
    }
    expect(isReserved("tumelo")).toBe(true);
    expect(isReserved("somebody_new")).toBe(false);
  });

  it("is suggested from the provider's name, or the front of the email, when one fits", () => {
    expect(suggestHandle("Tumelo Malebo", "t@example.com")).toBe("tumelo_malebo");
    expect(suggestHandle("Zoë Ångström", null)).toBe("zoe_angstrom");
    expect(suggestHandle(null, "tumi.m@example.com")).toBe("tumi_m");
    // nothing usable, or nothing free: no suggestion rather than a bad one
    expect(suggestHandle("李", null)).toBe("");
    expect(suggestHandle(null, "account@example.com")).toBe("");
    expect(suggestHandle("A very long name that goes on and on", null).length).toBeLessThanOrEqual(20);
  });
});

describe("claiming and editing a canon", () => {
  it("needs a name to go on it, at most 80 characters", () => {
    expect(claimSchema.safeParse({ handle: "fresh", displayName: "  " }).success).toBe(false);
    expect(claimSchema.safeParse({ handle: "fresh", displayName: "n".repeat(81) }).success).toBe(false);
    expect(claimSchema.parse({ handle: "Fresh", displayName: " Fresh Person " })).toEqual({
      handle: "fresh",
      displayName: "Fresh Person",
    });
  });

  it("holds the line under the name to 200 characters, the same cap the database has", () => {
    const edit = (bio: string) => profileEditSchema.safeParse({ displayName: "n", bio, region: "za" });
    expect(edit("b".repeat(200)).success).toBe(true);
    expect(edit("b".repeat(201)).success).toBe(false);
  });

  it("only offers regions there is streaming data for", () => {
    expect(profileEditSchema.safeParse({ displayName: "n", bio: "", region: "ZA" }).success).toBe(true);
    expect(profileEditSchema.safeParse({ displayName: "n", bio: "", region: "zz" }).success).toBe(false);
  });

  it("starts a new canon where the person is, when we know the place", () => {
    expect(regionFrom("ZA")).toBe("za");
    expect(regionFrom("ZZ")).toBe("us");
    expect(regionFrom(null)).toBe("us");
  });
});

describe("the ways in", () => {
  it("are Google and Apple, and nothing a form could slip in", () => {
    expect(providerSchema.safeParse("google").success).toBe(true);
    expect(providerSchema.safeParse("apple").success).toBe(true);
    expect(providerSchema.safeParse("github").success).toBe(false);
  });

  it("take an email address as typed, and nothing that is not one", () => {
    expect(emailSchema.parse("  Tumi@Example.com ")).toBe("tumi@example.com");
    expect(emailSchema.safeParse("not an email").success).toBe(false);
    expect(emailSchema.safeParse(`${"a".repeat(320)}@example.com`).success).toBe(false);
  });
});
