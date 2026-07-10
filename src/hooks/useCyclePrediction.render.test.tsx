import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { differenceInDays } from "date-fns";
import { useCyclePrediction, type PeriodRecord } from "./useCyclePrediction";
import type { UserHealthContext } from "./useUserHealthContext";

// Exercises the core prediction hook end-to-end (tier selection, averages,
// confidence, and the ovulation/fertile-window offsets). The exported
// helpers are covered separately in useCyclePrediction.test.ts.

const rec = (start: string, end: string | null = null): PeriodRecord => ({
  period_start_date: start,
  period_end_date: end,
  cycle_length: 28, // stored value is ignored; the hook derives from dates
});

function predict(input: Parameters<typeof useCyclePrediction>[0]) {
  return renderHook(() => useCyclePrediction(input)).result.current;
}

describe("useCyclePrediction (core hook)", () => {
  it("tier 1: no data falls back to population averages", () => {
    const p = predict({ periodRecords: [], daySignals: {} });
    expect(p.tier).toBe(1);
    expect(p.averageCycleLength).toBe(29); // round(28.5)
    expect(p.averagePeriodLength).toBe(5);
    expect(p.confidenceLevel).toBe("low");
    expect(p.cyclesLogged).toBe(0);
  });

  it("tier 2: onboarding estimates with no logged cycles", () => {
    const p = predict({
      periodRecords: [],
      daySignals: {},
      onboardingEstimates: { cycleLength: 30, periodLength: 6 },
    });
    expect(p.tier).toBe(2);
    expect(p.averageCycleLength).toBe(30);
    expect(p.averagePeriodLength).toBe(6);
  });

  it("tier 3: one or two logged cycles (fewer than 3 valid)", () => {
    const p = predict({
      periodRecords: [rec("2026-02-01"), rec("2026-01-04")], // one 28-day cycle
      daySignals: {},
    });
    expect(p.tier).toBe(3);
    expect(p.averageCycleLength).toBe(28);
    expect(p.cyclesLogged).toBe(2);
  });

  it("tier 4: three or more valid cycles use the personal pattern", () => {
    const p = predict({
      periodRecords: [
        rec("2026-03-26"),
        rec("2026-02-26"),
        rec("2026-01-29"),
        rec("2026-01-01"),
      ], // three ~28-day cycles
      daySignals: {},
    });
    expect(p.tier).toBe(4);
    expect(p.averageCycleLength).toBe(28);
  });

  it("excludes an implausible cycle length from the average", () => {
    // A huge gap (200 days) is outside MIN/MAX_VALID_CYCLE and must be dropped.
    const p = predict({
      periodRecords: [rec("2026-06-01"), rec("2026-05-04"), rec("2025-10-01")],
      daySignals: {},
    });
    expect(p.excludedCycles).toBeGreaterThanOrEqual(1);
  });

  it("manual override wins over derived averages", () => {
    const p = predict({
      periodRecords: [rec("2026-02-01"), rec("2026-01-04")],
      daySignals: {},
      manualOverrides: { cycleLength: 40 },
    });
    expect(p.averageCycleLength).toBe(40);
  });

  it("places ovulation 14 days before the predicted period and frames the fertile window", () => {
    const p = predict({ periodRecords: [], daySignals: {} });
    expect(differenceInDays(p.predictedPeriodStart, p.predictedOvulationDate)).toBe(14);
    // Fertile window: ovulation - 5 .. ovulation + 1.
    expect(differenceInDays(p.predictedOvulationDate, p.fertileWindowStart)).toBe(5);
    expect(differenceInDays(p.fertileWindowEnd, p.predictedOvulationDate)).toBe(1);
  });
});

// Minimal health-context builder; all flags null / no labs unless overridden.
function hc(over: Partial<UserHealthContext>): UserHealthContext {
  return {
    loaded: true,
    age: null,
    ageBracket: null,
    amhAssessment: null,
    labs: {},
    tshOutOfRange: null,
    highFsh: null,
    menopausalFsh: null,
    pcosLhFshPattern: null,
    highProlactin: null,
    highTestosterone: null,
    ...over,
  } as unknown as UserHealthContext;
}
const lab = (value: number) => ({ value }) as UserHealthContext["labs"]["tsh"];

const fourCycles: PeriodRecord[] = [
  rec("2026-03-26"),
  rec("2026-02-26"),
  rec("2026-01-29"),
  rec("2026-01-01"),
];

describe("useCyclePrediction — lab-driven caveats", () => {
  it("adds no risk factors and does not age-adjust without a health context", () => {
    const p = predict({ periodRecords: [], daySignals: {} });
    expect(p.riskFactors).toEqual([]);
    expect(p.ageAdjusted).toBe(false);
  });

  it("flags out-of-range TSH and widens the confidence window", () => {
    const p = predict({
      periodRecords: [],
      daySignals: {},
      healthContext: hc({ tshOutOfRange: true, labs: { tsh: lab(5.2) } }),
    });
    expect(p.riskFactors.some((r) => /TSH 5\.2 mIU\/L is outside/.test(r))).toBe(true);
    expect(p.confidenceWindow).toBeGreaterThan(1); // widened past the regular baseline
  });

  it("uses the menopausal-FSH message when FSH is in the menopausal range", () => {
    const p = predict({
      periodRecords: [],
      daySignals: {},
      healthContext: hc({ menopausalFsh: true, highFsh: true, labs: { fsh: lab(30) } }),
    });
    expect(p.riskFactors.some((r) => /menopausal range/.test(r))).toBe(true);
    expect(p.riskFactors.some((r) => /above 10/.test(r))).toBe(false); // not both messages
  });

  it("flags the PCOS LH/FSH pattern", () => {
    const p = predict({
      periodRecords: [],
      daySignals: {},
      healthContext: hc({ pcosLhFshPattern: true }),
    });
    expect(p.riskFactors.some((r) => /PCOS pattern/.test(r))).toBe(true);
  });

  it("age-adjusts and adds a perimenopausal caveat at 40+ with enough cycles", () => {
    const p = predict({
      periodRecords: fourCycles,
      daySignals: {},
      healthContext: hc({ age: 45 }),
    });
    expect(p.ageAdjusted).toBe(true);
    expect(p.riskFactors.some((r) => /Perimenopausal range \(age 45\)/.test(r))).toBe(true);
  });
});
