import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getEffectiveEndDate,
  isActivePeriod,
  getCurrentCycleDay,
  isInFertileWindow,
  isOvulationDay,
  getPredictionMessage,
  type PeriodRecord,
  type CyclePrediction,
} from "./useCyclePrediction";

afterEach(() => vi.useRealTimers());

const period = (overrides: Partial<PeriodRecord> = {}): PeriodRecord => ({
  period_start_date: "2026-01-01",
  period_end_date: null,
  cycle_length: 28,
  ...overrides,
});

describe("getEffectiveEndDate", () => {
  it("returns the confirmed end date when present", () => {
    expect(getEffectiveEndDate(period({ period_end_date: "2026-01-06" }), 5)).toBe("2026-01-06");
  });

  it("projects start + (avgPeriodLength - 1) for an active period", () => {
    // 2026-01-01 + (5 - 1) days = 2026-01-05
    expect(getEffectiveEndDate(period({ period_end_date: null }), 5)).toBe("2026-01-05");
  });
});

describe("isActivePeriod", () => {
  it("is active only when there is no end date", () => {
    expect(isActivePeriod(period({ period_end_date: null }))).toBe(true);
    expect(isActivePeriod(period({ period_end_date: "2026-01-06" }))).toBe(false);
  });
});

describe("getCurrentCycleDay", () => {
  it("counts the period start day as cycle day 1", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0, 0));
    expect(getCurrentCycleDay(new Date(2026, 0, 1), 28)).toBe(1);
  });

  it("returns the day offset within the cycle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0, 0));
    expect(getCurrentCycleDay(new Date(2026, 0, 1), 28)).toBe(15);
  });

  it("wraps back to day 1 at the start of the next cycle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 29, 12, 0, 0, 0)); // 28 days later
    expect(getCurrentCycleDay(new Date(2026, 0, 1), 28)).toBe(1);
  });
});

describe("isInFertileWindow", () => {
  const start = new Date(2026, 0, 10);
  const end = new Date(2026, 0, 16);
  it("includes the window boundaries", () => {
    expect(isInFertileWindow(start, start, end)).toBe(true);
    expect(isInFertileWindow(end, start, end)).toBe(true);
  });
  it("excludes dates outside the window", () => {
    expect(isInFertileWindow(new Date(2026, 0, 9), start, end)).toBe(false);
    expect(isInFertileWindow(new Date(2026, 0, 17), start, end)).toBe(false);
  });
});

describe("isOvulationDay", () => {
  it("matches only the same calendar day", () => {
    expect(isOvulationDay(new Date(2026, 0, 14, 8, 0), new Date(2026, 0, 14, 22, 0))).toBe(true);
    expect(isOvulationDay(new Date(2026, 0, 15), new Date(2026, 0, 14))).toBe(false);
  });
});

describe("getPredictionMessage", () => {
  const base = (overrides: Partial<CyclePrediction>): CyclePrediction =>
    ({
      predictedPeriodStart: new Date(2026, 0, 20),
      confidenceWindow: 2,
      isRegular: true,
      ...overrides,
    }) as CyclePrediction;

  it("gives a single expected date when regular", () => {
    expect(getPredictionMessage(base({ isRegular: true }))).toBe("Expected Jan 20");
  });

  it("gives a date range spanning the confidence window when irregular", () => {
    // 2026-01-20 ± 2 days => Jan 18-22
    expect(getPredictionMessage(base({ isRegular: false, confidenceWindow: 2 }))).toBe("Expected Jan 18-22");
  });
});
