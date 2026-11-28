import { describe, it, expect } from "vitest";
import { summarizeResults, summaryHeadline, summaryChanges } from "./resultsSummary";

const r = (title: string, status: string | null, date: string | null) => ({ title, status, data_type: "lab_result", date_recorded: date });

describe("summarizeResults", () => {
  it("counts each test once by its latest reading; urgent is part of outside; borderline is not outside", () => {
    const s = summarizeResults([
      r("TSH", "abnormal", "2026-03-01"),
      r("TSH", "normal", "2026-09-01"),
      r("Ferritin", "low", "2026-09-01"),
      r("Potassium", "critical", "2026-09-02"),
      r("Glucose", "borderline", "2026-09-01"),
    ]);
    expect(s).toEqual({ total: 4, outside: 2, urgent: 1, changed: 1 });
  });

  it("counts a test as changed when it crossed the range either way since the reading before", () => {
    const s = summarizeResults([
      r("TSH", "abnormal", "2026-03-01"), r("TSH", "normal", "2026-09-01"), // back in
      r("Ferritin", "normal", "2026-03-01"), r("Ferritin", "abnormal", "2026-09-01"), // newly out
      r("B12", "abnormal", "2026-03-01"), r("B12", "high", "2026-09-01"), // out both times
      r("Iron", "borderline", "2026-03-01"), r("Iron", "abnormal", "2026-09-01"), // borderline: no crossing
      r("CRP", "normal", "2026-09-01"), r("CRP", "abnormal", "2026-09-01"), // same day: no earlier reading
    ]);
    expect(s.changed).toBe(2);
  });

  it("is zero for no results", () => {
    expect(summarizeResults([])).toEqual({ total: 0, outside: 0, urgent: 0, changed: 0 });
  });
});

describe("summary wording: facts only, never a score", () => {
  it("states outside of total and the urgent ones", () => {
    expect(summaryHeadline({ total: 24, outside: 3, urgent: 1, changed: 2 })).toBe("3 of 24 latest results outside the lab's range (1 marked urgent)");
    expect(summaryChanges({ total: 24, outside: 3, urgent: 0, changed: 2 })).toBe("2 moved in or out of range since the previous test");
    expect(summaryChanges({ total: 24, outside: 3, urgent: 0, changed: 0 })).toBeNull();
  });

  it("says all within range when nothing is outside", () => {
    expect(summaryHeadline({ total: 5, outside: 0, urgent: 0, changed: 0 })).toBe("All 5 latest results within the lab's range");
    expect(summaryHeadline({ total: 1, outside: 0, urgent: 0, changed: 0 })).toBe("Your latest result is within the lab's range");
  });

  it("never prints a percentage or the word wellness", () => {
    for (const s of [{ total: 4, outside: 1, urgent: 0, changed: 1 }, { total: 4, outside: 0, urgent: 0, changed: 0 }]) {
      const text = `${summaryHeadline(s)} ${summaryChanges(s) ?? ""}`;
      expect(text).not.toMatch(/%|wellness|score|healthy/i);
    }
  });
});
