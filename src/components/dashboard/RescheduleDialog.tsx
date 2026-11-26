import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { computeFreeSlots, viewerOutsidePracticeTz, type BusySlot, type ScheduleDay } from '@/lib/timeSlots';
import { formatPracticeTime } from '@/lib/practiceTime';
import { bookingFailure, formatVisitWhen } from '@/lib/booking';

// One-step reschedule for an upcoming appointment. Same slot rules as
// the FindDoctor booking dialog (shared computeFreeSlots), with the
// appointment being moved excluded from the busy list so its own slot
// doesn't block adjacent times. The server re-checks conflicts
// atomically on submit.

export interface ReschedulableAppointment {
  id: string;
  doctor_id: string;
  scheduled_at: string;
  duration: number | null;
  doctor_name?: string | null;
  doctor_title?: string | null;
}

interface RescheduleDialogProps {
  appointment: ReschedulableAppointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled: () => void;
}


const RescheduleDialog = ({ appointment, open, onOpenChange, onRescheduled }: RescheduleDialogProps) => {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 'paused' = the doctor has bookings off (or is no longer listed): the
  // visit stays as booked, it just cannot be moved right now.
  const [doctorState, setDoctorState] = useState<'loading' | 'ready' | 'paused' | 'error'>('loading');
  const [busyFailed, setBusyFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // Load the doctor's weekly schedule + visit length once per open, from
  // the patient-facing profile (404 = not taking bookings right now).
  useEffect(() => {
    if (!open || !appointment) return;
    let cancelled = false;
    setDoctorState('loading');
    setNotice(null);
    setSchedule(null);
    (async () => {
      try {
        const resp = await fetch(`/api/doctors/profile?doctor_id=${encodeURIComponent(appointment.doctor_id)}`);
        if (resp.status === 404) { if (!cancelled) setDoctorState('paused'); return; }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        const doc = payload.doctor;
        if (cancelled) return;
        setSchedule(doc?.schedule ?? []);
        setDuration(
          appointment.duration && appointment.duration > 0
            ? appointment.duration
            : doc?.consultation_settings?.consultation_duration || 30
        );
        setDoctorState('ready');
      } catch (e) {
        console.error('Failed to load doctor schedule:', e);
        if (!cancelled) setDoctorState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [open, appointment, reloadKey]);

  // Load busy slots for the picked date.
  useEffect(() => {
    if (!open || !appointment || !selectedDate) {
      setBusy([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      setBusyFailed(false);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const resp = await fetch(
          `/api/doctors/availability?doctor_id=${encodeURIComponent(appointment.doctor_id)}&date=${dateStr}`
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        if (!cancelled) setBusy((payload.busy ?? []) as BusySlot[]);
      } catch (e) {
        console.error('Failed to load availability:', e);
        if (!cancelled) { setBusy([]); setBusyFailed(true); }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, appointment, selectedDate, reloadKey]);

  const slots = useMemo(() => {
    if (!appointment || !selectedDate || !schedule || busyFailed) return [];
    // Exclude the appointment being moved from the busy list — its own
    // current slot shouldn't block the times around it.
    const currentStart = new Date(appointment.scheduled_at).getTime();
    const busyWithoutSelf = busy.filter(
      b => new Date(b.scheduled_at).getTime() !== currentStart
    );
    return computeFreeSlots({
      date: selectedDate,
      schedule,
      durationMin: duration,
      busy: busyWithoutSelf,
    });
  }, [appointment, selectedDate, schedule, duration, busy, busyFailed]);

  const submit = async (slot: Date) => {
    if (!appointment) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const resp = await fetch('/api/appointments/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: appointment.id,
          scheduled_at: slot.toISOString(),
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const kind = bookingFailure(resp.status, payload.code);
        if (kind === 'slot_taken' || kind === 'past' || kind === 'outside_hours') {
          setNotice('That time was just taken. The times below are still free. Your visit has not changed.');
          setReloadKey(k => k + 1);
          return;
        }
        if (kind === 'bookings_off') {
          setDoctorState('paused');
          return;
        }
        throw new Error(payload.error || `HTTP ${resp.status}`);
      }
      toast({
        title: 'Appointment rescheduled',
        description: `Moved to ${formatVisitWhen(slot)}.`,
      });
      onOpenChange(false);
      setSelectedDate(undefined);
      onRescheduled();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Could not reschedule',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const doctorLabel = appointment
    ? [appointment.doctor_title, appointment.doctor_name].filter(Boolean).join(' ') || 'your doctor'
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            {appointment && (
              <>Currently {formatVisitWhen(new Date(appointment.scheduled_at))} with {doctorLabel}. Pick a new time below.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {notice && (
          <p role="alert" className="text-sm rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 p-3">{notice}</p>
        )}
        {doctorState === 'paused' ? (
          <div className="text-center space-y-3" data-testid="reschedule-paused">
            <p className="text-sm">
              {doctorLabel.charAt(0).toUpperCase() + doctorLabel.slice(1)} has paused new bookings, so this visit cannot be moved right now.
              It is still booked at the original time; you can keep it or cancel it.
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Keep my visit</Button>
          </div>
        ) : doctorState === 'error' ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">We could not load your doctor's times.</p>
            <Button variant="outline" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
          </div>
        ) : (
        <div className="flex flex-col items-center gap-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return date < today;
            }}
            className="rounded-md border"
          />

          {selectedDate && (
            <div className="w-full">
              {loadingSlots || doctorState === 'loading' ? (
                <p className="text-sm text-muted-foreground text-center">Checking which times are free…</p>
              ) : busyFailed ? (
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">We could not check this day's free times.</p>
                  <Button size="sm" variant="outline" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center">
                  No free slots on {format(selectedDate, 'PPP')} — try another day.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((slot) => (
                    <Button
                      key={slot.toISOString()}
                      variant="outline"
                      size="sm"
                      disabled={submitting}
                      onClick={() => submit(slot)}
                    >
                      {formatPracticeTime(slot)}
                    </Button>
                  ))}
                  {viewerOutsidePracticeTz() && (
                    <p className="col-span-3 text-[11px] text-muted-foreground">Times are Swiss time (Zurich).</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RescheduleDialog;
