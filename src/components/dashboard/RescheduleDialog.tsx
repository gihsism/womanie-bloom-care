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
import { computeFreeSlots, type BusySlot, type ScheduleDay } from '@/lib/timeSlots';

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

interface DoctorListEntry {
  user_id: string;
  schedule?: ScheduleDay[];
  consultation_settings?: { consultation_duration: number } | null;
}

const RescheduleDialog = ({ appointment, open, onOpenChange, onRescheduled }: RescheduleDialogProps) => {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load the doctor's weekly schedule + consultation duration once per open.
  useEffect(() => {
    if (!open || !appointment) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/doctors/list');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        const doc = (payload.doctors ?? []).find(
          (d: DoctorListEntry) => d.user_id === appointment.doctor_id
        );
        if (!cancelled && doc) {
          setSchedule(doc.schedule ?? []);
          setDuration(
            appointment.duration && appointment.duration > 0
              ? appointment.duration
              : doc.consultation_settings?.consultation_duration || 30
          );
        }
      } catch (e) {
        console.error('Failed to load doctor schedule:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, appointment]);

  // Load busy slots for the picked date.
  useEffect(() => {
    if (!open || !appointment || !selectedDate) {
      setBusy([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
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
        if (!cancelled) setBusy([]);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, appointment, selectedDate]);

  const slots = useMemo(() => {
    if (!appointment || !selectedDate || !schedule) return [];
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
  }, [appointment, selectedDate, schedule, duration, busy]);

  const submit = async (slot: Date) => {
    if (!appointment) return;
    setSubmitting(true);
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
        throw new Error(payload.error || `HTTP ${resp.status}`);
      }
      toast({
        title: 'Appointment rescheduled',
        description: `Moved to ${format(slot, 'PPP, p')}.`,
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
              <>Currently {format(new Date(appointment.scheduled_at), 'PPP, p')} with {doctorLabel}. Pick a new time below.</>
            )}
          </DialogDescription>
        </DialogHeader>

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
              {loadingSlots ? (
                <p className="text-sm text-muted-foreground text-center">Checking availability…</p>
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
                      {format(slot, 'HH:mm')}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RescheduleDialog;
