import { describe, it, expect } from "vitest";
import { parseNumeric, statusShift, computeTrends, type ExtractedItem } from "./health-trends";

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
