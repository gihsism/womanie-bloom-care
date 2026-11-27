import { describe, it, expect } from "vitest";
import { parseNumeric, statusShift, computeTrends, detectRun, describeRun, formatLabDay, type ExtractedItem } from "./health-trends";

const lab = (o: Partial<ExtractedItem> = {}): ExtractedItem => ({
  title: "Ferritin",
  value: "20",
  unit: "ng/mL",
  status: "normal",
  data_type: "lab_result",
  date_recorded: "2026-01-01",
  document_id: "d1",
  ...o,
});

describe("parseNumeric", () => {
  it("pulls the first number out of a string", () => {
    expect(parseNumeric("12.5")).toBe(12.5);
    expect(parseNumeric("  8 ng/mL")).toBe(8);
    expect(parseNumeric("<5")).toBe(5);
    expect(parseNumeric("-3.2")).toBe(-3.2);
  });
  it("returns null for unparseable or missing input", () => {
    expect(parseNumeric(null)).toBeNull();
    expect(parseNumeric("normal")).toBeNull();
  });
});

describe("statusShift", () => {
  it("calls a move to a less severe status an improvement", () => {
    expect(statusShift("abnormal", "normal")).toBe("improved");
    expect(statusShift("critical", "abnormal")).toBe("improved");
  });
  it("calls a move to a more severe status a worsening", () => {
    expect(statusShift("normal", "abnormal")).toBe("worsened");
  });
  it("treats equal severities (incl. normal/expected) as the same", () => {
    expect(statusShift("normal", "expected")).toBe("same");
    expect(statusShift(null, "informational")).toBe("same");
  });
});

describe("computeTrends", () => {
  it("ignores tests with fewer than two parseable readings", () => {
    expect(computeTrends([lab()])).toEqual([]);
    expect(computeTrends([lab({ value: "n/a" }), lab({ date_recorded: "2026-02-01" })])).toEqual([]);
  });

  it("compares the two most recent readings (newest first) regardless of input order", () => {
    const trends = computeTrends([
      lab({ value: "10", date_recorded: "2026-01-01" }),
      lab({ value: "40", date_recorded: "2026-03-01" }),
      lab({ value: "25", date_recorded: "2026-02-01" }),
    ]);
    expect(trends).toHaveLength(1);
    expect(trends[0].latestValue).toBe(40); // March
    expect(trends[0].prevValue).toBe(25); // February
    expect(trends[0].count).toBe(3);
    expect(trends[0].direction).toBe("up");
  });

  it("marks a small change as flat", () => {
    const trends = computeTrends([
      lab({ value: "100", date_recorded: "2026-01-01" }),
      lab({ value: "101", date_recorded: "2026-02-01" }),
    ]);
    expect(trends[0].direction).toBe("flat");
  });

  it("computes percent change against the absolute previous value", () => {
    const trends = computeTrends([
      lab({ value: "50", date_recorded: "2026-01-01" }),
      lab({ value: "75", date_recorded: "2026-02-01" }),
    ]);
    expect(trends[0].pctChange).toBeCloseTo(50);
  });

  it("avoids divide-by-zero when the previous value is 0", () => {
    const trends = computeTrends([
      lab({ value: "0", date_recorded: "2026-01-01" }),
      lab({ value: "5", date_recorded: "2026-02-01" }),
    ]);
    expect(trends[0].pctChange).toBe(0);
  });

  it("groups independent tests separately", () => {
    const trends = computeTrends([
      lab({ title: "Ferritin", value: "10", date_recorded: "2026-01-01" }),
      lab({ title: "Ferritin", value: "20", date_recorded: "2026-02-01" }),
      lab({ title: "TSH", value: "2", date_recorded: "2026-01-01" }),
      lab({ title: "TSH", value: "3", date_recorded: "2026-02-01" }),
    ]);
    expect(trends.map(t => t.title).sort()).toEqual(["Ferritin", "TSH"]);
  });
});

describe("steady rise or fall across 3+ panels", () => {
  const panels = (vals: Array<[string, string, string?]>) =>
    vals.map(([value, date, unit], i) => lab({ value, date_recorded: date, unit: unit ?? "ng/mL", document_id: `d${i}` }));

  it("finds ferritin falling across three panels, oldest first, with dates", () => {
    const [t] = computeTrends(panels([["45", "2026-03-12"], ["18", "2026-09-02"], ["30", "2026-06-05"]]));
    expect(t.run).toEqual({
      direction: "falling",
      points: [
        { value: 45, raw: "45", date: "2026-03-12" },
        { value: 30, raw: "30", date: "2026-06-05" },
        { value: 18, raw: "18", date: "2026-09-02" },
      ],
    });
    expect(describeRun(t.run!, t.unit)).toBe(
      "Gone down at each of your last 3 tests: 45 (12 Mar 2026) → 30 (5 Jun 2026) → 18 ng/mL (2 Sep 2026)",
    );
  });

  it("finds a rise and stops the run where the direction last changed", () => {
    const [t] = computeTrends(panels([["50", "2025-01-01"], ["20", "2025-06-01"], ["25", "2025-12-01"], ["31", "2026-04-01"]]));
    expect(t.run?.direction).toBe("rising");
    expect(t.run?.points.map(p => p.value)).toEqual([20, 25, 31]);
  });

  it("no run for two readings, a zig-zag, or a flat step", () => {
    expect(computeTrends(panels([["10", "2026-01-01"], ["20", "2026-02-01"]]))[0].run).toBeUndefined();
    expect(computeTrends(panels([["10", "2026-01-01"], ["20", "2026-02-01"], ["15", "2026-03-01"]]))[0].run).toBeUndefined();
    expect(computeTrends(panels([["100", "2026-01-01"], ["101", "2026-02-01"], ["120", "2026-03-01"]]))[0].run).toBeUndefined();
  });

  it("only counts readings in the latest unit (spellings of one unit match)", () => {
    // Vitamin D: nmol/L and ng/mL differ by 2.5x, so the nmol/L panel is left out.
    const mixed = computeTrends(panels([["75", "2026-01-01", "nmol/L"], ["40", "2026-03-01", "ng/mL"], ["35", "2026-06-01", "ng/mL"]]));
    expect(mixed[0].run).toBeUndefined();
    const spelled = computeTrends(panels([["60", "2026-01-01", "µg/L"], ["40", "2026-03-01", "ug/l"], ["20", "2026-06-01", "mcg/L"]]));
    expect(spelled[0].run?.points).toHaveLength(3);
  });

  it("two readings on one day count once", () => {
    const run = detectRun([
      { value: 18, raw: "18", date: "2026-09-02", unit: "ng/mL" },
      { value: 30, raw: "30", date: "2026-06-05", unit: "ng/mL" },
      { value: 31, raw: "31", date: "2026-06-05", unit: "ng/mL" },
    ]);
    expect(run).toBeNull();
  });

  it("one test even when two labs spell the title differently", () => {
    const trends = computeTrends([
      lab({ title: "Ferritin", value: "45", date_recorded: "2026-01-01" }),
      lab({ title: "ferritin ", value: "30", date_recorded: "2026-02-01" }),
      lab({ title: "FERRITIN", value: "18", date_recorded: "2026-03-01" }),
    ]);
    expect(trends).toHaveLength(1);
    expect(trends[0].title).toBe("FERRITIN");
    expect(trends[0].run?.direction).toBe("falling");
  });

  it("caps a long run at the most recent points", () => {
    const vals = Array.from({ length: 9 }, (_, i) => [String(10 + i * 5), `2026-0${i + 1}-01`] as [string, string]);
    const [t] = computeTrends(panels(vals));
    expect(t.run?.points).toHaveLength(6);
    expect(t.run?.points.at(-1)?.value).toBe(50);
  });

  it("ranks a steady run above a bigger one-off change", () => {
    const trends = computeTrends([
      ...panels([["45", "2026-01-01"], ["40", "2026-02-01"], ["36", "2026-03-01"]]),
      lab({ title: "TSH", value: "1", date_recorded: "2026-01-01" }),
      lab({ title: "TSH", value: "2.5", date_recorded: "2026-03-01" }),
    ]);
    expect(trends.map(t => t.title)).toEqual(["Ferritin", "TSH"]);
  });

  it("formats lab days as calendar days", () => {
    expect(formatLabDay("2026-03-12")).toBe("12 Mar 2026");
    expect(formatLabDay("2026-12-01T23:30:00Z")).toBe("1 Dec 2026");
    expect(formatLabDay("not a date")).toBe("not a date");
  });
});
