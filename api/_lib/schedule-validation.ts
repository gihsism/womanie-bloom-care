// Validation for the doctor weekly-availability payload (POST
// /api/doctors/schedule). Pure so the booking-critical rules — valid
// weekday, HH:MM times, end strictly after start — are unit-tested
// independently of the request handler. A bad row must reject the whole
// save rather than partially apply.

export interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export type ParseResult =
  | { ok: true; days: ScheduleDay[] }
  | { ok: false; error: string };

// HH:MM, 24-hour, zero-padded.
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseScheduleDays(input: unknown): ParseResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "days[] required" };
  }
  const days: ScheduleDay[] = [];
  for (const raw of input) {
    const d = raw as Partial<ScheduleDay>;
    if (
      typeof d.day_of_week !== "number" ||
      !Number.isInteger(d.day_of_week) ||
      d.day_of_week < 0 ||
      d.day_of_week > 6 ||
      typeof d.start_time !== "string" ||
      typeof d.end_time !== "string" ||
      !TIME_RE.test(d.start_time) ||
      !TIME_RE.test(d.end_time) ||
      d.end_time <= d.start_time
    ) {
      return {
        ok: false,
        error: "Each day needs day_of_week 0-6 and start_time < end_time as HH:MM",
      };
    }
    days.push({ day_of_week: d.day_of_week, start_time: d.start_time, end_time: d.end_time });
  }
  return { ok: true, days };
}
