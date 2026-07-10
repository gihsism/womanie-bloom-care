import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useSymptomPatterns,
  type PeriodRecord,
  type DaySignal,
} from "./useCyclePrediction";

// useSymptomPatterns finds symptoms that recur on the same cycle day across
// >=70% of the last (up to 6) cycles. Covers the "your typical symptoms by
// cycle day" feature.

const rec = (start: string): PeriodRecord => ({
  period_start_date: start,
  period_end_date: null,
  cycle_length: 28,
});

const sig = (symptoms: string[]): DaySignal =>
  ({ symptoms } as unknown as DaySignal);

function patterns(records: PeriodRecord[], signals: Record<string, DaySignal>, cycleLength = 28) {
  return renderHook(() => useSymptomPatterns(records, signals, cycleLength)).result.current;
}

describe("useSymptomPatterns", () => {
  it("returns nothing with fewer than three cycles", () => {
    expect(patterns([rec("2026-01-01"), rec("2026-02-01")], {})).toEqual([]);
  });

  it("detects a symptom that recurs on the same cycle day every cycle", () => {
    const records = [rec("2026-01-01"), rec("2026-02-01"), rec("2026-03-01")];
    // Cramps logged on day 1 (the cycle start date) of all three cycles.
    const signals = {
      "2026-01-01": sig(["cramps"]),
      "2026-02-01": sig(["cramps"]),
      "2026-03-01": sig(["cramps"]),
    };
    const result = patterns(records, signals);
    const cramps = result.find((p) => p.symptom === "cramps");
    expect(cramps).toBeDefined();
    expect(cramps!.typicalDays).toEqual([1]);
    expect(cramps!.frequency).toBe(100);
  });

  it("ignores a one-off symptom below the recurrence threshold", () => {
    const records = [rec("2026-01-01"), rec("2026-02-01"), rec("2026-03-01")];
    // 'nausea' appears in only one of three cycles (below the 70% threshold).
    const signals = {
      "2026-01-01": sig(["cramps", "nausea"]),
      "2026-02-01": sig(["cramps"]),
      "2026-03-01": sig(["cramps"]),
    };
    const result = patterns(records, signals);
    expect(result.some((p) => p.symptom === "cramps")).toBe(true);
    expect(result.some((p) => p.symptom === "nausea")).toBe(false);
  });
});
