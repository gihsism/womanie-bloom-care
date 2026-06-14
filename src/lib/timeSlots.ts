import { setHours, setMinutes } from 'date-fns';

// Shared free-slot computation for the booking flow (FindDoctor) and
// the reschedule dialog. Schedule times are HH:MM strings interpreted
// in the viewer's local timezone — the convention the booking flow has
// always used. Server-side conflict checks remain the source of truth
// at write time; this only decides what to offer.

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
}): Date[] {
  const { date, schedule, durationMin, busy } = opts;
  const daySchedule = schedule?.find(
    s => s.day_of_week === date.getDay() && s.is_active !== false
  );
  if (!daySchedule) return [];

  const [startHour, startMin] = daySchedule.start_time.split(':').map(Number);
  const [endHour, endMin] = daySchedule.end_time.split(':').map(Number);
  if ([startHour, startMin, endHour, endMin].some(Number.isNaN)) return [];

  let currentTime = setMinutes(setHours(date, startHour), startMin);
  const endTime = setMinutes(setHours(date, endHour), endMin);

  // Busy intervals as [startMs, endMs) so overlap is a tight check.
  const busyIntervals = busy.map(b => {
    const startMs = new Date(b.scheduled_at).getTime();
    const dur = typeof b.duration === 'number' && b.duration > 0 ? b.duration : durationMin;
    return [startMs, startMs + dur * 60000] as const;
  });

  const nowMs = Date.now();
  const slots: Date[] = [];

  while (currentTime < endTime) {
    const slotStart = currentTime.getTime();
    const slotEnd = slotStart + durationMin * 60000;
    const overlapsBusy = busyIntervals.some(([bs, be]) => slotStart < be && slotEnd > bs);
    // Don't offer a slot that would run past the end of the doctor's
    // hours — only happens when the duration doesn't divide the window
    // evenly (e.g. a 45-min slot in a window that ends at 10:00).
    const overrunsWindow = slotEnd > endTime.getTime();
    // Hide slots that have already started — picking 10:00 at 10:15
    // would just produce a server-side error. (Keyed on slotStart, not
    // slotEnd: a slot already in progress is no longer bookable.)
    const inPast = slotStart <= nowMs;
    if (!overlapsBusy && !inPast && !overrunsWindow) {
      slots.push(new Date(currentTime));
    }
    currentTime = new Date(currentTime.getTime() + durationMin * 60000);
  }

  return slots;
}
