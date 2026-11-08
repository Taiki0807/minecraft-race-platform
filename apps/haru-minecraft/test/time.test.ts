import { describe, expect, it } from "vitest";
import { nowJstIso } from "../src/util/time.js";

describe("nowJstIso", () => {
  it("formats a UTC instant as JST (+09:00)", () => {
    // 2026-11-07T00:00:00Z -> 2026-11-07T09:00:00+09:00
    expect(nowJstIso(new Date("2026-11-07T00:00:00.000Z"))).toBe(
      "2026-11-07T09:00:00+09:00"
    );
  });

  it("rolls the date forward across midnight UTC", () => {
    // 2026-11-07T15:30:00Z -> 2026-11-08T00:30:00+09:00
    expect(nowJstIso(new Date("2026-11-07T15:30:00.000Z"))).toBe(
      "2026-11-08T00:30:00+09:00"
    );
  });
});
