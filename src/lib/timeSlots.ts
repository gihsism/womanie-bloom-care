import { PRACTICE_TZ, freeSlotsForDay } from './practiceTime';

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
  const { date } = opts;
  return freeSlotsForDay({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    schedule: opts.schedule,
    durationMin: opts.durationMin,
    busy: opts.busy,
    tz: opts.timeZone ?? PRACTICE_TZ,
  });
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
