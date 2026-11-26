import { describe, it, expect, afterEach, vi } from "vitest";
import { computeFreeSlots, type ScheduleDay } from "./timeSlots";
import { dayWindowUtc, fitsSchedule, formatPracticeTime, wallTimeToUtc } from "./practiceTime";

// A comfortably-future date so the "already started" filter never trips
// except in the test that explicitly fakes the clock. The picked calendar
// day is 2099-01-06 (its local Y-M-D); hours are read in Zurich time.
const BASE = new Date(2099, 0, 6, 0, 0, 0, 0);
const zurich = (h: number, m = 0) => wallTimeToUtc(2099, 1, 6, h, m);

function scheduleFor(
  start: string,
  end: string,
  active: boolean | null | undefined = true,
): ScheduleDay[] {
  // 2099-01-06 is a Tuesday.
  return [{ day_of_week: 2, start_time: start, end_time: end, is_active: active }];
}

function labels(slots: Date[]): string[] {
  return slots.map((s) => formatPracticeTime(s).replace(/^0/, ""));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("computeFreeSlots", () => {
  it("returns nothing when no schedule matches the weekday", () => {
    const schedule = [{ day_of_week: 3, start_time: "09:00", end_time: "17:00" }];
    expect(computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("returns nothing when the matching day is inactive", () => {
    const schedule = scheduleFor("09:00", "17:00", false);
    expect(computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("treats a missing schedule as no availability", () => {
    expect(computeFreeSlots({ date: BASE, schedule: null, durationMin: 30, busy: [] })).toEqual([]);
    expect(computeFreeSlots({ date: BASE, schedule: undefined, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("returns nothing when the schedule times are malformed", () => {
    const schedule = scheduleFor("oops", "17:00");
    expect(computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("generates back-to-back slots across the window, in Zurich time", () => {
    const schedule = scheduleFor("09:00", "11:00");
    const slots = computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] });
    expect(labels(slots)).toEqual(["9:00", "9:30", "10:00", "10:30"]);
    // 09:00 Zurich in January (CET, UTC+1) is 08:00 UTC, whatever the device zone.
    expect(slots[0].toISOString()).toBe("2099-01-06T08:00:00.000Z");
  });

  it("accepts Postgres HH:MM:SS times", () => {
    const schedule = scheduleFor("09:00:00", "10:00:00");
    expect(labels(computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] }))).toEqual(["9:00", "9:30"]);
  });

  it("does not offer a slot that would run past the end of the window", () => {
    const schedule = scheduleFor("09:00", "10:00");
    const slots = computeFreeSlots({ date: BASE, schedule, durationMin: 45, busy: [] });
    expect(labels(slots)).toEqual(["9:00"]);
  });

  it("excludes slots that overlap a busy appointment", () => {
    const schedule = scheduleFor("09:00", "11:00");
    const slots = computeFreeSlots({
      date: BASE,
      schedule,
      durationMin: 30,
      busy: [{ scheduled_at: zurich(9, 30).toISOString(), duration: 30 }],
    });
    expect(labels(slots)).toEqual(["9:00", "10:00", "10:30"]);
  });

  it("an off-grid busy visit blocks every slot it overlaps", () => {
    const schedule = scheduleFor("09:00", "11:00");
    const slots = computeFreeSlots({
      date: BASE,
      schedule,
      durationMin: 30,
      busy: [{ scheduled_at: zurich(9, 45).toISOString(), duration: 30 }],
    });
    expect(labels(slots)).toEqual(["9:00", "10:30"]);
  });

  it("falls back to the requested duration when a busy slot has no duration", () => {
    const schedule = scheduleFor("09:00", "11:00");
    const slots = computeFreeSlots({
      date: BASE,
      schedule,
      durationMin: 30,
      busy: [{ scheduled_at: zurich(9, 30).toISOString(), duration: null }],
    });
    expect(labels(slots)).toEqual(["9:00", "10:00", "10:30"]);
  });

  it("offers two windows on one day without duplicates (overlapping rows)", () => {
    const schedule: ScheduleDay[] = [
      { day_of_week: 2, start_time: "09:00", end_time: "10:00" },
      { day_of_week: 2, start_time: "09:30", end_time: "10:30" },
    ];
    const slots = computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] });
    expect(labels(slots)).toEqual(["9:00", "9:30", "10:00"]);
  });

  it("hides slots that have already started today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(zurich(9, 15));
    const schedule = scheduleFor("09:00", "11:00");
    const slots = computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] });
    expect(labels(slots)).toEqual(["9:30", "10:00", "10:30"]);
  });
});

describe("practice time (Europe/Zurich)", () => {
  it("handles summer time (CEST, UTC+2)", () => {
    expect(wallTimeToUtc(2099, 7, 1, 9, 0).toISOString()).toBe("2099-07-01T07:00:00.000Z");
  });

  it("day window runs Zurich midnight to midnight", () => {
    const w = dayWindowUtc("2099-01-06")!;
    expect(w.start.toISOString()).toBe("2099-01-05T23:00:00.000Z");
    expect(w.end.toISOString()).toBe("2099-01-06T23:00:00.000Z");
    expect(dayWindowUtc("2099-13-40")).toBeNull();
    expect(dayWindowUtc("nope")).toBeNull();
  });

  it("DST change day has 23 hours", () => {
    // 2099-03-29 is the last Sunday of March 2099.
    const w = dayWindowUtc("2099-03-29")!;
    expect((w.end.getTime() - w.start.getTime()) / 3600_000).toBe(23);
  });

  it("fitsSchedule checks the window in Zurich time", () => {
    const schedule = [{ day_of_week: 2, start_time: "09:00", end_time: "11:00" }];
    expect(fitsSchedule(zurich(9, 0), 30, schedule)).toBe(true);
    expect(fitsSchedule(zurich(10, 30), 30, schedule)).toBe(true);
    expect(fitsSchedule(zurich(10, 45), 30, schedule)).toBe(false);
    expect(fitsSchedule(zurich(8, 30), 30, schedule)).toBe(false);
    expect(fitsSchedule(zurich(3, 0), 30, schedule)).toBe(false);
    expect(fitsSchedule(zurich(9, 0), 30, [{ ...schedule[0], is_active: false }])).toBe(false);
  });
});
