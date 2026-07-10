import { describe, it, expect } from "vitest";
import { median, scorePredictions } from "./prediction-accuracy";

describe("median", () => {
  it("returns the middle value for odd-length input", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middle values for even-length input", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("returns 0 for empty input", () => {
    expect(median([])).toBe(0);
  });
});

describe("scorePredictions", () => {
  it("returns nothing with fewer than four periods", () => {
    expect(scorePredictions(["2026-01-01", "2026-01-29", "2026-02-26"])).toEqual([]);
  });

  it("scores a perfectly regular history with zero error", () => {
    // Every cycle is 28 days, so each prediction lands exactly.
    const dates = ["2026-01-01", "2026-01-29", "2026-02-26", "2026-03-26", "2026-04-23"];
    const scored = scorePredictions(dates);
    expect(scored.length).toBeGreaterThanOrEqual(2);
    for (const s of scored) expect(s.deltaDays).toBe(0);
  });

  it("reports a signed error when the actual period drifts from the projection", () => {
    // First three cycles are 28 days; the 5th period comes 3 days late.
    const dates = ["2026-01-01", "2026-01-29", "2026-02-26", "2026-03-26", "2026-04-26"];
    const scored = scorePredictions(dates);
    const last = scored[scored.length - 1];
    // median gap = 28, predicted = 2026-03-26 + 28 = 2026-04-23, actual 2026-04-26 → +3
    expect(last.deltaDays).toBe(3);
  });

  it("caps output at the last four scoreable predictions", () => {
    // 10 periods, all 28-day cycles → 8 scoreable, keep last 4.
    const dates: string[] = [];
    const start = new Date(Date.UTC(2026, 0, 1));
    for (let i = 0; i < 10; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i * 28);
      dates.push(d.toISOString().slice(0, 10));
    }
    expect(scorePredictions(dates)).toHaveLength(4);
  });

  it("drops an implausible gap so it doesn't poison the median", () => {
    // A 200-day gap is outside the valid cycle range and must be ignored.
    const dates = ["2025-01-01", "2026-01-01", "2026-01-29", "2026-02-26", "2026-03-26"];
    const scored = scorePredictions(dates);
    // Still produces scored predictions from the valid 28-day gaps.
    expect(scored.length).toBeGreaterThanOrEqual(1);
    expect(scored.every((s) => Math.abs(s.deltaDays) <= 30)).toBe(true);
  });
});
