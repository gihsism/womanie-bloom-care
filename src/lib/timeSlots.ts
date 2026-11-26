import { PRACTICE_TZ, dayOfWeek, parseHm, wallTimeToUtc } from './practiceTime';

// Shared free-slot computation for the booking flow (FindDoctor) and
// the reschedule dialog. Schedule times are HH:MM wall-clock times in
// practice time (Europe/Zurich), whatever zone the patient's device is
// in; the calendar day is the one she picked (its local Y-M-D). Server-
// side checks (book/reschedule) remain the source of truth at write time;
// this only decides what to offer.

export interface ScheduleDay {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean | null;
}

export interface BusySlot {
  scheduled_at: string;
  duration: number | null;
}

export function computeFreeSlots(opts: {
  date: Date;
  schedule: ScheduleDay[] | null | undefined;
  durationMin: number;
  busy: BusySlot[];
  timeZone?: string;
}): Date[] {
  const { date, schedule, durationMin, busy } = opts;
  const tz = opts.timeZone ?? PRACTICE_TZ;
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  const d = date.getDate();
  const dow = dayOfWeek(y, mo, d);
  // Each active row for the weekday is its own window.
  const windows = (schedule ?? []).filter(s => s.day_of_week === dow && s.is_active !== false);
  if (windows.length === 0 || !(durationMin > 0)) return [];

  // Busy intervals as [startMs, endMs) so overlap is a tight check.
  const busyIntervals = busy.map(b => {
    const startMs = new Date(b.scheduled_at).getTime();
    const dur = typeof b.duration === 'number' && b.duration > 0 ? b.duration : durationMin;
    return [startMs, startMs + dur * 60000] as const;
  });

  const nowMs = Date.now();
  const seen = new Set<number>();
  const slots: Date[] = [];

  for (const w of windows) {
    const open = parseHm(w.start_time);
    const close = parseHm(w.end_time);
    if (open === null || close === null || close <= open) continue;
    // Step in wall-clock minutes and convert each start on its own, so a
    // DST change never shifts the grid. A slot that would run past closing
    // time is not offered (45-min visits in a window ending at 10:00).
    for (let m = open; m + durationMin <= close; m += durationMin) {
      const start = wallTimeToUtc(y, mo, d, Math.floor(m / 60), m % 60, tz);
      const slotStart = start.getTime();
      const slotEnd = slotStart + durationMin * 60000;
      const overlapsBusy = busyIntervals.some(([bs, be]) => slotStart < be && slotEnd > bs);
      // Hide slots that have already started: picking 10:00 at 10:15
      // would just produce a server-side error.
      const inPast = slotStart <= nowMs;
      if (!overlapsBusy && !inPast && !seen.has(slotStart)) {
        seen.add(slotStart);
        slots.push(start);
      }
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/** Is the device's clock showing a different time than Zurich right now? */
export function viewerOutsidePracticeTz(now: Date = new Date()): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === PRACTICE_TZ) return false;
    const fmt = (z: string) =>
      new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    return fmt(tz) !== fmt(PRACTICE_TZ);
  } catch {
    return false;
  }
}
