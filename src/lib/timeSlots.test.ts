import { describe, it, expect, afterEach, vi } from "vitest";
import { computeFreeSlots, type ScheduleDay } from "./timeSlots";

// A comfortably-future date so the "already started" filter never trips
// except in the test that explicitly fakes the clock. Midnight local.
const BASE = new Date(2099, 0, 6, 0, 0, 0, 0);

function scheduleFor(
  date: Date,
  start: string,
  end: string,
  active: boolean | null | undefined = true,
): ScheduleDay[] {
  return [{ day_of_week: date.getDay(), start_time: start, end_time: end, is_active: active }];
}

function labels(slots: Date[]): string[] {
  return slots.map((s) => `${s.getHours()}:${String(s.getMinutes()).padStart(2, "0")}`);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("computeFreeSlots", () => {
  it("returns nothing when no schedule matches the weekday", () => {
    const schedule = [
      { day_of_week: (BASE.getDay() + 1) % 7, start_time: "09:00", end_time: "17:00" },
    ];
    expect(computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("returns nothing when the matching day is inactive", () => {
    const schedule = scheduleFor(BASE, "09:00", "17:00", false);
    expect(computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("treats a missing schedule as no availability", () => {
    expect(computeFreeSlots({ date: BASE, schedule: null, durationMin: 30, busy: [] })).toEqual([]);
    expect(computeFreeSlots({ date: BASE, schedule: undefined, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("returns nothing when the schedule times are malformed", () => {
    const schedule = scheduleFor(BASE, "oops", "17:00");
    expect(computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] })).toEqual([]);
  });

  it("generates back-to-back slots across the window", () => {
    const schedule = scheduleFor(BASE, "09:00", "11:00");
    const slots = computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] });
    expect(labels(slots)).toEqual(["9:00", "9:30", "10:00", "10:30"]);
  });

  it("does not offer a slot that would run past the end of the window", () => {
    // 45-min slots in a one-hour window: only 09:00 fits (ends 09:45);
    // 09:45 would end 10:30, past the 10:00 close, so it must be dropped.
    const schedule = scheduleFor(BASE, "09:00", "10:00");
    const slots = computeFreeSlots({ date: BASE, schedule, durationMin: 45, busy: [] });
    expect(labels(slots)).toEqual(["9:00"]);
  });

  it("excludes slots that overlap a busy appointment", () => {
    const schedule = scheduleFor(BASE, "09:00", "11:00");
    const busyAt = new Date(2099, 0, 6, 9, 30, 0, 0);
    const slots = computeFreeSlots({
      date: BASE,
      schedule,
      durationMin: 30,
      busy: [{ scheduled_at: busyAt.toISOString(), duration: 30 }],
    });
    // 09:30 is taken; the neighbours touch but don't overlap.
    expect(labels(slots)).toEqual(["9:00", "10:00", "10:30"]);
  });

  it("falls back to the requested duration when a busy slot has no duration", () => {
    const schedule = scheduleFor(BASE, "09:00", "11:00");
    const busyAt = new Date(2099, 0, 6, 9, 30, 0, 0);
    const slots = computeFreeSlots({
      date: BASE,
      schedule,
      durationMin: 30,
      busy: [{ scheduled_at: busyAt.toISOString(), duration: null }],
    });
    // null duration => treated as a 30-min block, so only 09:30 is blocked.
    expect(labels(slots)).toEqual(["9:00", "10:00", "10:30"]);
  });

  it("hides slots that have already started today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2099, 0, 6, 9, 15, 0, 0)); // 09:15 on the booking day
    const schedule = scheduleFor(BASE, "09:00", "11:00");
    const slots = computeFreeSlots({ date: BASE, schedule, durationMin: 30, busy: [] });
    // 09:00 has already started; first bookable slot is 09:30.
    expect(labels(slots)).toEqual(["9:30", "10:00", "10:30"]);
  });
});
