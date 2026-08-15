import { describe, expect, it } from "vitest";
import { ATTRIBUTION, offersFor, onYourServices, regionName } from "./availability";

describe("offersFor", () => {
  it("returns different providers for different regions", () => {
    const nz = offersFor("jiro", "nz").map((o) => o.provider.id);
    const us = offersFor("jiro", "us").map((o) => o.provider.id);
    expect(nz).toEqual(["prime", "rent"]);
    expect(us).toEqual(["max", "rent"]);
    expect(nz).not.toEqual(us);
  });

  it("treats a wildcard entry as the same everywhere", () => {
    for (const region of ["nz", "za", "jp", "us"] as const) {
      expect(offersFor("gtav", region).map((o) => o.provider.id)).toEqual(["youtube"]);
    }
  });

  it("carries the mandatory attribution on every single offer", () => {
    // plan §6: TMDB revokes access when the JustWatch credit is not per-item.
    const offers = offersFor("senn", "us");
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) expect(offer.attribution).toBe(ATTRIBUTION);
  });

  it("never synthesises a provider deep link", () => {
    // TMDB gives no deep links, so every click target must be a tmdb page.
    for (const offer of offersFor("miya", "us")) {
      expect(offer.watchUrl).toContain("themoviedb.org");
      expect(offer.watchUrl).not.toContain("netflix.com");
    }
  });

  it("treats not-streaming-here as an ordinary empty answer", () => {
    expect(offersFor("btls", "de")).toEqual([]);
    expect(offersFor("no-such-work", "nz")).toEqual([]);
  });
});

describe("onYourServices", () => {
  it("counts anything free regardless of subscriptions", () => {
    expect(onYourServices("gtav", "nz", new Set())).toBe(true);
  });

  it("counts a paid service only when the visitor has it", () => {
    expect(onYourServices("senn", "nz", new Set(["netflix"]))).toBe(true);
    expect(onYourServices("senn", "za", new Set(["netflix"]))).toBe(false);
    expect(onYourServices("senn", "za", new Set(["showmax"]))).toBe(true);
  });

  it("is false when there is nothing on offer at all", () => {
    expect(onYourServices("btls", "de", new Set(["disney"]))).toBe(false);
  });
});

describe("regionName", () => {
  it("names the regions it knows and passes through the ones it does not", () => {
    expect(regionName("nz")).toBe("new zealand");
    expect(regionName("de")).toBe("de");
  });
});
