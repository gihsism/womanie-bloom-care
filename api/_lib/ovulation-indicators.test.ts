import { describe, it, expect } from "vitest";
import { extractIndicators } from "./ovulation-indicators";

const day = (o: object) => ({ signal_date: "2026-10-01", ...o });

describe("extractIndicators", () => {
  it("recognises the UI's stored discharge values as fertile mucus", () => {
    expect(extractIndicators([day({ discharge: "ewcm" })])).toContain("Fertile-type cervical mucus logged recently");
    expect(extractIndicators([day({ discharge: "watery" })])).toContain("Fertile-type cervical mucus logged recently");
  });

  it("does not treat non-fertile discharge as fertile", () => {
    for (const d of ["dry", "sticky", "creamy"]) {
      expect(extractIndicators([day({ discharge: d })])).toEqual(["1 days of health signals available"]);
    }
  });

  it("reads BBT and a positive LH test from notes, where DailyLogging stores them", () => {
    const out = extractIndicators([day({ notes: "LH test: positive. BBT: 97.9°F. Sleep: 7h" })]);
    expect(out).toContain("Basal body temperature readings available");
    expect(out).toContain("Positive LH / ovulation test detected");
  });

  it("ignores a negative or untested LH result", () => {
    const out = extractIndicators([day({ notes: "LH test: negative" }), day({ notes: "LH test: not-tested" })]);
    expect(out).not.toContain("Positive LH / ovulation test detected");
  });

  it("still honours dedicated columns if present", () => {
    const out = extractIndicators([day({ basal_temp: 36.6, lh_test: "peak" })]);
    expect(out).toContain("Basal body temperature readings available");
    expect(out).toContain("Positive LH / ovulation test detected");
  });

  it("returns nothing for no signals", () => {
    expect(extractIndicators([])).toEqual([]);
  });
});
