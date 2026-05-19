import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';
import { onHealthDataChange, emitHealthDataChange } from '@/lib/data-events';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, formatDistanceToNowStrict, isToday, isTomorrow, isPast } from 'date-fns';
import {
  ArrowLeft,
  CalendarClock,
  Video,
  MapPin,
  Stethoscope,
  ShieldCheck,
  X,
  Search,
  History,
  CalendarPlus,
} from 'lucide-react';
import { downloadIcs } from '@/lib/ics';

// Patient-side full appointments view: upcoming + past in one page.
// Backed by the same /api/me/appointments endpoint the dashboard widget
// uses, called without ?upcoming=true so the server returns everything
// (DESC). We bucket client-side so we can keep a single round-trip.

interface AppointmentRow {
  id: string;
  doctor_id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type: string | null;
  duration: number | null;
  payment_status: string | null;
  notes: string | null;
  doctor_name: string | null;
  doctor_title: string | null;
  doctor_specialties: string[] | null;
  doctor_avatar_url: string | null;
  doctor_verified: boolean | null;
}

// Extracts the doctor's reason out of the notes field on doctor-
// cancelled appointments. The doctor cancel flow stamps notes with
// "Cancelled by doctor: <reason>" — anything else (or a missing prefix)
// returns null so we don't render an empty hint.
function doctorCancelReason(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/^Cancelled by doctor:\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

function relativeDay(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days > 0 && days < 7) return format(d, 'EEEE');
  return format(d, 'MMM d, yyyy');
}

function isUpcoming(apt: AppointmentRow): boolean {
  if ((apt.status ?? '').toLowerCase() === 'cancelled') return false;
  return !isPast(new Date(apt.scheduled_at));
}

type PastFilter = 'all' | 'completed' | 'no_show' | 'cancelled' | 'unresolved';

const Appointments = () => {
  const navigate = useNavigate();
  usePageTitle('My Appointments');
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pastFilter, setPastFilter] = useState<PastFilter>('all');

  const load = async () => {
    if (!user) return;
    try {
      const resp = await fetch('/api/me/appointments');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setRows((payload.appointments ?? []) as AppointmentRow[]);
    } catch (e) {
      console.error('Failed to load appointments:', e);
      toast({
        variant: 'destructive',
        title: 'Could not load appointments',
        description: errorMessage(e, 'Please try again.'),
      });
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const upcoming = useMemo(
    () => rows.filter(isUpcoming).sort((a, b) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    ),
    [rows]
  );

  const past = useMemo(
    () => rows.filter(r => !isUpcoming(r)),
    [rows]
  );

  const pastCounts = useMemo(() => {
    const counts = { all: past.length, completed: 0, no_show: 0, cancelled: 0, unresolved: 0 };
    for (const a of past) {
      const s = (a.status ?? '').toLowerCase();
      if (s === 'completed') counts.completed++;
      else if (s === 'no_show' || s === 'no-show') counts.no_show++;
      else if (s === 'cancelled') counts.cancelled++;
      else counts.unresolved++;
    }
    return counts;
  }, [past]);

  const filteredPast = useMemo(() => {
    if (pastFilter === 'all') return past;
    return past.filter(a => {
      const s = (a.status ?? '').toLowerCase();
      if (pastFilter === 'completed') return s === 'completed';
      if (pastFilter === 'no_show') return s === 'no_show' || s === 'no-show';
      if (pastFilter === 'cancelled') return s === 'cancelled';
      if (pastFilter === 'unresolved') {
        return s !== 'completed' && s !== 'no_show' && s !== 'no-show' && s !== 'cancelled';
      }
      return true;
    });
  }, [past, pastFilter]);

  const cancel = async (apt: AppointmentRow) => {
    const doctorLabel = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'this doctor';
    const when = format(new Date(apt.scheduled_at), 'PPP, p');
    if (!window.confirm(`Cancel your appointment with ${doctorLabel} on ${when}?`)) return;
    setBusyId(apt.id);
    try {
      const { error } = await db
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', apt.id);
      if (error) throw error;
      toast({
        title: 'Appointment cancelled',
        description: `Your appointment with ${doctorLabel} on ${when} has been cancelled.`,
        action: (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const { error: undoErr } = await db
                  .from('appointments')
                  .update({ status: 'scheduled' })
                  .eq('id', apt.id);
                if (undoErr) throw undoErr;
                toast({ title: 'Cancellation undone', description: 'Your appointment is back on the schedule.' });
                emitHealthDataChange();
                await load();
              } catch (e) {
                toast({ variant: 'destructive', title: 'Could not undo', description: errorMessage(e, 'Please try again.') });
              }
            }}
          >
            Undo
          </Button>
        ),
      });
      emitHealthDataChange();
      await load();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Could not cancel',
        description: errorMessage(error, 'Please try again.'),
      });
    } finally {
      setBusyId(null);
    }
  };

  const renderAppointment = (apt: AppointmentRow, kind: 'upcoming' | 'past') => {
    const when = new Date(apt.scheduled_at);
    const name = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'A doctor';
    const specialty = Array.isArray(apt.doctor_specialties) && apt.doctor_specialties.length > 0
      ? apt.doctor_specialties[0]
      : null;
    const isVideo = apt.consultation_type === 'video';
    const statusLower = (apt.status ?? '').toLowerCase();
    const isCancelled = statusLower === 'cancelled';
    const isCompleted = statusLower === 'completed';
    const isNoShow = statusLower === 'no_show' || statusLower === 'no-show';

    return (
      <li
        key={apt.id}
        className={`flex items-start gap-3 p-4 rounded-lg border bg-card ${
          kind === 'past' || isCancelled ? 'opacity-70' : ''
        }`}
      >
        {apt.doctor_avatar_url ? (
          <img src={apt.doctor_avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Stethoscope className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-sm font-medium truncate">{name}</span>
            {apt.doctor_verified && (
              <span className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-300">
                <ShieldCheck className="h-3 w-3" />
                Verified
              </span>
            )}
            {isCancelled && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-destructive/40 text-destructive">
                Cancelled
              </Badge>
            )}
            {isCompleted && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 border-transparent">
                Completed
              </Badge>
            )}
            {isNoShow && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border-transparent">
                No-show
              </Badge>
            )}
            {apt.payment_status === 'pending' && !isCancelled && kind === 'upcoming' && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px]">Payment pending</Badge>
            )}
          </div>
          {specialty && <p className="text-[11px] text-muted-foreground mb-1">{specialty}</p>}
          <p className="text-xs text-muted-foreground">
            {kind === 'upcoming'
              ? `${relativeDay(when)} · ${format(when, 'p')} · in ${formatDistanceToNowStrict(when)}`
              : `${format(when, 'PPP')} · ${format(when, 'p')}`}
            {apt.duration ? ` · ${apt.duration} min` : ''}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
            {isVideo ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
            {isVideo ? 'Video consultation' : 'In-person'}
          </p>
          {isCancelled && (() => {
            const reason = doctorCancelReason(apt.notes);
            if (!reason) return null;
            return (
              <p className="text-[11px] mt-1.5 px-2 py-1 rounded bg-destructive/5 border border-destructive/20 text-destructive">
                <span className="font-medium">Cancelled by doctor:</span> {reason}
              </p>
            );
          })()}
        </div>
        {kind === 'upcoming' && !isCancelled && (
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                downloadIcs({
                  uid: apt.id,
                  start: when,
                  durationMinutes: apt.duration ?? 30,
                  title: `Consultation with ${name}`,
                  description:
                    `${isVideo ? 'Video consultation' : 'In-person consultation'} on Womanie.` +
                    (specialty ? ` Specialty: ${specialty}.` : ''),
                  location: isVideo ? 'Video call (Womanie)' : 'In-person',
                  url: `${window.location.origin}/dashboard/appointments`,
                });
                toast({ title: 'Calendar event saved', description: 'Open the .ics file to add it.' });
              }}
              title="Add to calendar"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Add to calendar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-destructive"
              onClick={() => cancel(apt)}
              disabled={busyId === apt.id}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="h-6 w-px bg-border" />
              <h1 className="text-xl font-bold text-primary">My Appointments</h1>
            </div>
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              onClick={() => navigate('/find-doctor')}
            >
              <Search className="h-4 w-4" />
              Book new
            </Button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Upcoming */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Upcoming
            </h2>
            {loaded && <span className="text-xs text-muted-foreground">({upcoming.length})</span>}
          </div>
          {!loaded ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : upcoming.length === 0 ? (
            <Card className="p-6 text-center">
              <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">No upcoming appointments</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Book a consultation with one of our verified doctors.
              </p>
              <Button size="sm" onClick={() => navigate('/find-doctor')}>
                Browse doctors
              </Button>
            </Card>
          ) : (
            <ul className="space-y-2">
              {upcoming.map(apt => renderAppointment(apt, 'upcoming'))}
            </ul>
          )}
        </section>

        {/* Past */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Past
            </h2>
            {loaded && <span className="text-xs text-muted-foreground">({past.length})</span>}
          </div>
          {loaded && past.length > 3 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {([
                ['all', 'All', pastCounts.all],
                ['completed', 'Completed', pastCounts.completed],
                ['no_show', 'No-show', pastCounts.no_show],
                ['cancelled', 'Cancelled', pastCounts.cancelled],
                ['unresolved', 'Unresolved', pastCounts.unresolved],
              ] as const).map(([key, label, count]) => {
                if (count === 0 && key !== 'all') return null;
                const active = pastFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPastFilter(key)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/40 hover:bg-muted text-foreground border-transparent'
                    }`}
                    aria-pressed={active}
                  >
                    {label} <span className="opacity-70">· {count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!loaded ? (
            <Skeleton className="h-20 w-full" />
          ) : past.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Past appointments will appear here.
            </p>
          ) : filteredPast.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No past appointments match this filter.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredPast.slice(0, 50).map(apt => renderAppointment(apt, 'past'))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default Appointments;
