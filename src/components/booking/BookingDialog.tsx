import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle, CalendarPlus, CheckCircle, Clock, Loader2, MapPin, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { computeFreeSlots, viewerOutsidePracticeTz, type BusySlot } from '@/lib/timeSlots';
import { dayOfWeek, formatPracticeTime, wallParts } from '@/lib/practiceTime';
import { downloadIcs } from '@/lib/ics';
import { emitHealthDataChange } from '@/lib/data-events';
import { bookingFailure, formatPrice, formatVisitWhen, visitTypeLabel, type BookingFailure } from '@/lib/booking';

// The patient's booking dialog, shared by Find a Doctor and the doctor's
// profile page: pick a day, a free time (Swiss time), video or in person,
// confirm, then a confirmation screen. Every failure is said in place,
// in plain words, without closing the dialog:
// - availability could not load -> no times offered, "Try again";
// - 409 slot just taken -> times reload, the taken one disappears;
// - the doctor paused bookings meanwhile -> nothing booked, back to list;
// - the time passed while she was deciding -> times reload.

export interface BookableDoctor {
  user_id: string;
  full_name: string;
  title?: string | null;
  practice_address?: string | null;
  consultation_settings?: {
    consultation_price: number | null;
    currency: string;
    consultation_duration: number;
    video_enabled: boolean;
  } | null;
  schedule?: { day_of_week: number; start_time: string; end_time: string; is_active?: boolean | null }[];
}

import { doctorDisplayName } from '@/lib/doctorName';
export { doctorDisplayName };

const BOOK_AHEAD_DAYS = 90;

interface Props {
  doctor: BookableDoctor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselect a slot (ISO), e.g. one of the "next free times" on the profile. */
  initialSlot?: string | null;
  /** The doctor turned bookings off mid-flow: the caller refreshes its list. */
  onDoctorUnavailable?: (doctorId: string) => void;
}

type Notice = { kind: BookingFailure | 'availability'; text: string };

const BookingDialog = ({ doctor, open, onOpenChange, initialSlot, onDoctorUnavailable }: Props) => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [visitType, setVisitType] = useState<'in_person' | 'video'>('in_person');
  const [busy, setBusy] = useState<BusySlot[]>([]);
  const [busyState, setBusyState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [paused, setPaused] = useState(false);
  const [booked, setBooked] = useState<{ id: string; at: Date; type: string } | null>(null);

  const settings = doctor?.consultation_settings ?? null;
  const duration = settings?.consultation_duration || 30;
  const videoOn = !!settings?.video_enabled;
  const outside = viewerOutsidePracticeTz();
  const name = doctor ? doctorDisplayName(doctor) : '';

  // Fresh state each time the dialog opens (or opens on another doctor).
  useEffect(() => {
    if (!open) return;
    setNotice(null);
    setPaused(false);
    setBooked(null);
    setSubmitting(false);
    setVisitType('in_person');
    if (initialSlot) {
      const at = new Date(initialSlot);
      if (!Number.isNaN(at.getTime())) {
        // The slot's Swiss calendar day, as a local date for the calendar.
        const p = wallParts(at);
        setSelectedDate(new Date(p.year, p.month - 1, p.day));
        setSelectedSlot(at.toISOString());
        return;
      }
    }
    setSelectedDate(undefined);
    setSelectedSlot('');
  }, [open, doctor?.user_id, initialSlot]);

  // Busy times for the picked day.
  const doctorId = doctor?.user_id ?? null;
  useEffect(() => {
    if (!open || !doctorId || !selectedDate) {
      setBusy([]);
      setBusyState('idle');
      return;
    }
    let cancelled = false;
    setBusyState('loading');
    (async () => {
      try {
        const params = new URLSearchParams({ doctor_id: doctorId, date: format(selectedDate, 'yyyy-MM-dd') });
        const resp = await fetch(`/api/doctors/availability?${params.toString()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        if (cancelled) return;
        setBusy((payload.busy ?? []) as BusySlot[]);
        setBusyState('ready');
      } catch (e) {
        console.error('Failed to load availability:', e);
        if (cancelled) return;
        // Never offer times we could not check: they may be taken.
        setBusy([]);
        setBusyState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [open, doctorId, selectedDate, reloadKey]);

  const slots = useMemo(() => {
    if (!doctor || !selectedDate || busyState !== 'ready') return [];
    return computeFreeSlots({ date: selectedDate, schedule: doctor.schedule, durationMin: duration, busy });
  }, [doctor, selectedDate, busyState, busy, duration]);

  // A preselected or previously picked time that is no longer free is dropped.
  useEffect(() => {
    if (busyState !== 'ready' || !selectedSlot) return;
    if (!slots.some(s => s.toISOString() === selectedSlot)) {
      setSelectedSlot('');
      setNotice(n => n ?? { kind: 'slot_taken', text: 'That time is no longer free. Please pick another one.' });
    }
  }, [busyState, slots, selectedSlot]);

  const isDayDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last = new Date(today);
    last.setDate(last.getDate() + BOOK_AHEAD_DAYS);
    if (date < today || date > last) return true;
    const dow = dayOfWeek(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return !(doctor?.schedule ?? []).some(s => s.day_of_week === dow && s.is_active !== false);
  };

  const pickDate = (d: Date | undefined) => {
    setSelectedDate(d);
    setSelectedSlot('');
    if (notice?.kind !== 'bookings_off') setNotice(null);
  };

  const confirm = async () => {
    if (!doctor || !selectedSlot || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const type = visitType === 'video' && videoOn ? 'video' : 'in_person';
      let resp: Response;
      try {
        resp = await fetch('/api/appointments/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doctor_id: doctor.user_id,
            scheduled_at: selectedSlot,
            duration,
            consultation_type: type,
          }),
        });
      } catch {
        setNotice({ kind: 'other', text: 'Could not reach Womanie. Check your connection and try again. Nothing was booked.' });
        return;
      }
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const kind = bookingFailure(resp.status, payload.code);
        if (kind === 'slot_taken') {
          setNotice({ kind, text: 'Someone booked that time a moment ago. The times below are still free.' });
          setSelectedSlot('');
          setReloadKey(k => k + 1);
        } else if (kind === 'bookings_off') {
          setPaused(true);
          setNotice({ kind, text: `${name} has just paused new bookings, so nothing was booked. Please choose another doctor.` });
        } else if (kind === 'past' || kind === 'outside_hours') {
          setNotice({ kind, text: 'That time is no longer available. Please pick one of the times below.' });
          setSelectedSlot('');
          setReloadKey(k => k + 1);
        } else {
          setNotice({ kind, text: `${payload.error || 'Something went wrong.'} Nothing was booked; please try again.` });
        }
        return;
      }
      const apt = payload.appointment ?? {};
      setBooked({
        id: String(apt.id ?? ''),
        at: new Date(apt.scheduled_at ?? selectedSlot),
        type: String(apt.consultation_type ?? type),
      });
      emitHealthDataChange();
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => onOpenChange(false);
  const price = formatPrice(settings?.consultation_price, settings?.currency);
  const selectedAt = selectedSlot ? new Date(selectedSlot) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto" data-testid="booking-dialog">
        {booked && doctor ? (
          <div className="text-center space-y-4 py-2" data-testid="booking-confirmed">
            <CheckCircle className="h-12 w-12 mx-auto text-primary" aria-hidden="true" />
            <DialogHeader className="sm:text-center">
              <DialogTitle className="text-center">Your visit is booked</DialogTitle>
              <DialogDescription className="text-center">
                {name} has your booking. It is now under Visits.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg bg-muted p-4 text-left text-sm space-y-1.5">
              <p className="font-medium">{formatVisitWhen(booked.at, outside)}</p>
              <p className="text-muted-foreground">{duration} minutes · {visitTypeLabel(booked.type)}</p>
              {booked.type !== 'video' && doctor.practice_address && (
                <p className="text-muted-foreground inline-flex items-start gap-1">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />{doctor.practice_address}
                </p>
              )}
              {price && <p className="text-muted-foreground">Price: {price}</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              You can move or cancel it under Visits. If phone reminders are on, we remind you the day before.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { close(); navigate('/dashboard/appointments'); }}>See my visits</Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => downloadIcs({
                  uid: booked.id || `${doctor.user_id}-${booked.at.getTime()}`,
                  start: booked.at,
                  durationMinutes: duration,
                  title: `Visit with ${name}`,
                  description: `${visitTypeLabel(booked.type)} visit booked on Womanie.`,
                  location: booked.type === 'video' ? 'Video call (Womanie)' : (doctor.practice_address || 'In person'),
                  url: `${window.location.origin}/dashboard/appointments`,
                })}
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                Add to calendar
              </Button>
              <Button variant="ghost" onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Book with {name}</DialogTitle>
              <DialogDescription>
                Pick a day and a time{outside ? '. Times are Swiss time (Zurich)' : ''}.
              </DialogDescription>
            </DialogHeader>

            {notice && (
              <div
                role="alert"
                data-testid="booking-notice"
                className={`flex gap-2 rounded-lg border p-3 text-sm ${
                  notice.kind === 'bookings_off' ? 'border-destructive/40 bg-destructive/5' : 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/20'
                }`}
              >
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <p>{notice.text}</p>
              </div>
            )}

            {paused ? (
              <div className="flex flex-col gap-2">
                <Button onClick={() => { close(); if (doctor) onDoctorUnavailable?.(doctor.user_id); }}>
                  Back to the doctor list
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {videoOn && (
                  <fieldset>
                    <legend className="text-sm font-medium mb-2">Type of visit</legend>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type of visit">
                      {(['in_person', 'video'] as const).map(t => (
                        <Button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={visitType === t}
                          variant={visitType === t ? 'default' : 'outline'}
                          className="gap-2"
                          onClick={() => setVisitType(t)}
                        >
                          {t === 'video' ? <Video className="h-4 w-4" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
                          {visitTypeLabel(t)}
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <div>
                  <p className="text-sm font-medium mb-2">Day</p>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={pickDate}
                    defaultMonth={selectedDate}
                    disabled={isDayDisabled}
                    className="rounded-md border"
                  />
                </div>

                {selectedDate && (
                  <div>
                    <p className="text-sm font-medium mb-2">Time{outside ? ' (Swiss time)' : ''}</p>
                    {busyState === 'loading' || busyState === 'idle' ? (
                      <div className="flex items-center justify-center py-4 bg-muted/50 rounded-lg gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Checking which times are free…
                      </div>
                    ) : busyState === 'error' ? (
                      <div className="text-center py-4 bg-muted/50 rounded-lg space-y-2" data-testid="availability-error">
                        <p className="text-sm text-muted-foreground">We could not check this day's free times.</p>
                        <Button size="sm" variant="outline" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="text-center py-4 bg-muted/50 rounded-lg">
                        <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" aria-hidden="true" />
                        <p className="text-sm text-muted-foreground">
                          {busy.length > 0 ? 'This day is fully booked.' : 'No free times left on this day.'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Please pick another day.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto" role="radiogroup" aria-label="Free times">
                        {slots.map(s => {
                          const iso = s.toISOString();
                          return (
                            <Button
                              key={iso}
                              role="radio"
                              aria-checked={selectedSlot === iso}
                              variant={selectedSlot === iso ? 'default' : 'outline'}
                              className="h-11 text-sm"
                              onClick={() => { setSelectedSlot(iso); if (notice?.kind !== 'bookings_off') setNotice(null); }}
                            >
                              {formatPracticeTime(s)}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {selectedAt && (
                  <div className="p-4 bg-muted rounded-lg text-sm space-y-1" data-testid="booking-summary">
                    <p className="font-medium">{formatVisitWhen(selectedAt, outside)}</p>
                    <p className="text-muted-foreground">
                      {duration} minutes · {visitTypeLabel(visitType === 'video' && videoOn ? 'video' : 'in_person')}
                    </p>
                    {!(visitType === 'video' && videoOn) && doctor?.practice_address && (
                      <p className="text-muted-foreground">{doctor.practice_address}</p>
                    )}
                    {price && <p className="font-medium pt-1">Price: {price}</p>}
                  </div>
                )}

                <Button className="w-full" disabled={!selectedSlot || submitting} onClick={confirm}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      Booking…
                    </>
                  ) : selectedSlot ? 'Confirm booking' : 'Pick a time to continue'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookingDialog;
