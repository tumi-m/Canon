import { describe, expect, it } from "vitest";
import { formatMinutes, toMinutes, totalMinutes } from "./runtime";

describe("toMinutes", () => {
  it("reads the shapes people actually type", () => {
    expect(toMinutes("6m")).toBe(6);
    expect(toMinutes("1hr 47m")).toBe(107);
    expect(toMinutes("2hr")).toBe(120);
    expect(toMinutes("6hr")).toBe(360);
    expect(toMinutes("2hr 1m")).toBe(121);
  });

  it("copes with spacing and case", () => {
    expect(toMinutes("1 HR 30 MIN")).toBe(90);
    expect(toMinutes("1hour 5mins")).toBe(65);
  });

  it("returns 0 rather than guessing at nonsense", () => {
    expect(toMinutes("")).toBe(0);
    expect(toMinutes("ages")).toBe(0);
    expect(toMinutes("???")).toBe(0);
  });
});

describe("formatMinutes", () => {
  it("drops the empty half of the pair", () => {
    expect(formatMinutes(47)).toBe("47m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(107)).toBe("1h 47m");
  });

  it("never renders a negative runtime", () => {
    expect(formatMinutes(-10)).toBe("0m");
  });
});

describe("totalMinutes", () => {
  it("sums a canon", () => {
    expect(totalMinutes(["6m", "1hr 47m", "2hr"])).toBe(233);
  });

  it("ignores the entries it cannot read", () => {
    expect(totalMinutes(["6m", "who knows"])).toBe(6);
  });
});
