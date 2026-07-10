import { isToday, isTomorrow, format } from "date-fns";

// Human-friendly day label for near-term dates (appointment lists, etc.):
// "Today" / "Tomorrow", the weekday name within the next 6 days ("Thursday"
// reads better than "Apr 24" for something soon), then "MMM d" beyond that.
// `now` is injectable for deterministic tests.
export function relativeDay(d: Date, now: number = Date.now()): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  const days = Math.round((d.getTime() - now) / 86_400_000);
  if (days >= 0 && days < 7) return format(d, "EEEE");
  return format(d, "MMM d");
}
