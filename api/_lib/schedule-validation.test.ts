import { describe, it, expect } from "vitest";
import { parseScheduleDays } from "./schedule-validation";

const day = (o: Record<string, unknown> = {}) => ({
  day_of_week: 1,
  start_time: "09:00",
  end_time: "17:00",
  ...o,
});

describe("parseScheduleDays", () => {
  it("accepts a valid set and returns the normalized days", () => {
    const r = parseScheduleDays([day(), day({ day_of_week: 3, start_time: "08:30", end_time: "12:00" })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.days).toHaveLength(2);
      expect(r.days[1]).toEqual({ day_of_week: 3, start_time: "08:30", end_time: "12:00" });
    }
  });

  it("accepts an empty schedule (doctor with no availability)", () => {
    const r = parseScheduleDays([]);
    expect(r).toEqual({ ok: true, days: [] });
  });

  it("rejects a non-array payload", () => {
    expect(parseScheduleDays(undefined).ok).toBe(false);
    expect(parseScheduleDays(null).ok).toBe(false);
    expect(parseScheduleDays({}).ok).toBe(false);
  });

  it("rejects out-of-range or non-integer weekdays", () => {
    expect(parseScheduleDays([day({ day_of_week: 7 })]).ok).toBe(false);
    expect(parseScheduleDays([day({ day_of_week: -1 })]).ok).toBe(false);
    expect(parseScheduleDays([day({ day_of_week: 1.5 })]).ok).toBe(false);
  });

  it("rejects malformed times", () => {
    expect(parseScheduleDays([day({ start_time: "9:00" })]).ok).toBe(false); // not zero-padded
    expect(parseScheduleDays([day({ end_time: "24:00" })]).ok).toBe(false); // out of range
    expect(parseScheduleDays([day({ start_time: "0900" })]).ok).toBe(false); // no colon
  });

  it("rejects end_time not strictly after start_time", () => {
    expect(parseScheduleDays([day({ start_time: "10:00", end_time: "10:00" })]).ok).toBe(false);
    expect(parseScheduleDays([day({ start_time: "17:00", end_time: "09:00" })]).ok).toBe(false);
  });

  it("rejects the whole set if any single day is invalid", () => {
    const r = parseScheduleDays([day(), day({ end_time: "bad" }), day({ day_of_week: 4 })]);
    expect(r.ok).toBe(false);
  });
});
