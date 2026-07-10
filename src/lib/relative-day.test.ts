import { describe, it, expect, afterEach, vi } from "vitest";
import { format } from "date-fns";
import { relativeDay } from "./relative-day";

afterEach(() => vi.useRealTimers());

// Anchor "now" to a fixed Monday so isToday/isTomorrow are deterministic.
const NOW = new Date(2026, 3, 20, 12, 0, 0); // Mon Apr 20 2026

function withNow<T>(fn: () => T): T {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  return fn();
}

describe("relativeDay", () => {
  it("labels the same day 'Today'", () => {
    withNow(() => {
      expect(relativeDay(new Date(2026, 3, 20, 18, 0))).toBe("Today");
    });
  });

  it("labels the next day 'Tomorrow'", () => {
    withNow(() => {
      expect(relativeDay(new Date(2026, 3, 21, 9, 0))).toBe("Tomorrow");
    });
  });

  it("uses the weekday name within the next week", () => {
    withNow(() => {
      const d = new Date(2026, 3, 23, 9, 0); // +3 days, still this week
      expect(relativeDay(d)).toBe(format(d, "EEEE"));
    });
  });

  it("falls back to 'MMM d' beyond a week out", () => {
    withNow(() => {
      const d = new Date(2026, 4, 1, 9, 0); // +11 days
      expect(relativeDay(d)).toBe(format(d, "MMM d"));
    });
  });
});
