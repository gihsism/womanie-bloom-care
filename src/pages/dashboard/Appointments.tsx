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
  CalendarClock,
  Video,
  MapPin,
  Stethoscope,
  ShieldCheck,
  X,
  Search,
  History,
  CalendarPlus,
  CalendarCog,
  ChevronDown,
  Users,
} from 'lucide-react';
import { downloadIcs } from '@/lib/ics';
import RescheduleDialog from '@/components/dashboard/RescheduleDialog';
import VisitPrepCard from '@/components/dashboard/VisitPrepCard';
import DoctorNotesCard from '@/components/dashboard/DoctorNotesCard';
import PendingConnections from '@/components/dashboard/PendingConnections';
import ConnectedDoctors from '@/components/dashboard/ConnectedDoctors';
import ChartAccessLog from '@/components/dashboard/ChartAccessLog';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { normalizeLifeStage } from '@/lib/lifeStage';

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
  return format(d, 'EEE d MMM');
}

function isUpcoming(apt: AppointmentRow): boolean {
  if ((apt.status ?? '').toLowerCase() === 'cancelled') return false;
  return !isPast(new Date(apt.scheduled_at));
}

type PastFilter = 'all' | 'completed' | 'no_show' | 'cancelled' | 'unresolved';

const Appointments = () => {
  const navigate = useNavigate();
  usePageTitle('Visits');
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<AppointmentRow | null>(null);
  const [pastFilter, setPastFilter] = useState<PastFilter>('all');
  const [mode, setMode] = useState<LifeStage | null>(null);

  // The life stage tunes "Questions to bring". Read-only here; the stage
  // is changed in Me.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await db.from('profiles').select('life_stage').eq('id', user.id).maybeSingle();
        if (!cancelled) setMode(normalizeLifeStage(data?.life_stage));
      } catch { /* non-fatal: the questions card just stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

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
        className={`rounded-[1.25rem] border border-line bg-card p-4 ${
          kind === 'past' || isCancelled ? 'opacity-70' : ''
        }`}
      >
       <div className="flex items-start gap-3">
        {apt.doctor_avatar_url ? (
          <img src={apt.doctor_avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-stage-tint flex items-center justify-center flex-shrink-0">
            <Stethoscope className="h-5 w-5 text-stage-accent" strokeWidth={1.9} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[17px] font-bold truncate">{name}</span>
            {apt.doctor_verified && (
              <span className="inline-flex items-center gap-1 text-[12px] text-green-700 dark:text-green-300">
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
          {specialty && <p className="text-[14px] text-muted-foreground">{specialty}</p>}
        </div>
       </div>
        <div className="mt-3">
          <p className="text-[19px] font-extrabold tabular-nums">
            {kind === 'upcoming'
              ? `${relativeDay(when)} · ${format(when, 'HH:mm')}`
              : `${format(when, 'd MMM yyyy')} · ${format(when, 'HH:mm')}`}
          </p>
          <p className="text-[14px] text-muted-foreground mt-0.5 inline-flex items-center gap-1.5 flex-wrap">
            {kind === 'upcoming' && <span>in {formatDistanceToNowStrict(when)} ·</span>}
            {isVideo ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
            {isVideo ? 'Video consultation' : 'In-person'}
            {apt.duration ? ` · ${apt.duration} min` : ''}
          </p>
          {isCancelled && (() => {
            const reason = doctorCancelReason(apt.notes);
            if (!reason) return null;
            return (
              <p className="text-[13px] mt-2 px-2.5 py-1.5 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive">
                <span className="font-medium">Cancelled by doctor:</span> {reason}
              </p>
            );
          })()}
        </div>
        {kind === 'upcoming' && !isCancelled && (
          <div className="flex flex-wrap justify-between gap-x-0 gap-y-1 mt-3 pt-2 -mx-2 border-t border-line">
            <Button
              variant="ghost"
              size="sm"
              className="text-[13px] gap-1 px-2 text-stage-accent font-semibold hover:text-stage-accent"
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
              className="text-[13px] gap-1 px-2 text-stage-accent font-semibold hover:text-stage-accent"
              onClick={() => setRescheduling(apt)}
              disabled={busyId === apt.id}
            >
              <CalendarCog className="h-3.5 w-3.5" />
              Reschedule
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-[13px] gap-1 px-2 font-semibold text-muted-foreground hover:text-destructive"
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

  const [nextVisit, ...laterVisits] = upcoming;
  const bookVisit = () => navigate('/find-doctor');

  return (
    <div className="min-h-screen bg-background">
      <div className="page-head sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Visits is a bottom-nav tab: no back arrow (sub-pages keep theirs). */}
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <h1 className="page-title whitespace-nowrap">Visits</h1>
                {loaded && (
                  <p className="page-sub">
                    {nextVisit ? `Next: ${relativeDay(new Date(nextVisit.scheduled_at))} · ${format(new Date(nextVisit.scheduled_at), 'HH:mm')}` : 'No visit booked'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-7">
        {/* Next visit, with the questions to bring attached to it */}
        <section aria-labelledby="next-visit-heading">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-5 w-5 text-stage-accent" strokeWidth={1.9} />
            <h2 id="next-visit-heading" className="section-title">
              Your next visit
            </h2>
          </div>
          {!loaded ? (
            <Skeleton className="h-20 w-full rounded-[1.25rem]" />
          ) : nextVisit ? (
            <ul className="space-y-2">{renderAppointment(nextVisit, 'upcoming')}</ul>
          ) : (
            <Card className="rounded-[1.25rem] border-line shadow-none p-6 text-center">
              <p className="text-[16px] text-muted-foreground">No visits yet.</p>
            </Card>
          )}
          {/* Questions to bring: hides itself when there is nothing to ask. */}
          {mode && (
            <div className="mt-3 [&>*]:!mb-0">
              <VisitPrepCard mode={mode} />
            </div>
          )}
        </section>

        {/* The one primary action on the page. */}
        {loaded && (
          <button type="button" className="btn-stage w-full" onClick={bookVisit}>
            <Search className="h-5 w-5" aria-hidden="true" />
            Book a visit
          </button>
        )}

        {/* Notes from your doctor: hides itself when there are none. */}
        <div className="empty:hidden [&>*]:!mb-0">
          <DoctorNotesCard />
        </div>

        {/* A doctor asking to see your records needs an answer, so this
            stays in view. Hides itself when nothing is pending. */}
        <div className="empty:hidden [&>*]:!mb-0">
          <PendingConnections />
        </div>

        {/* Later visits */}
        {loaded && laterVisits.length > 0 && (
          <section aria-labelledby="later-visits-heading">
            <h2 id="later-visits-heading" className="section-title mb-3">
              Later visits ({laterVisits.length})
            </h2>
            <ul className="space-y-2">
              {laterVisits.map(apt => renderAppointment(apt, 'upcoming'))}
            </ul>
          </section>
        )}

        {/* Your doctors: who can see your records, and when they looked */}
        <details className="group row-group">
          <summary className="flex cursor-pointer list-none items-center gap-3 min-h-14 px-4 py-3 text-[17px] font-medium hover:bg-muted/50">
            <Users className="h-5 w-5 text-stage-accent" strokeWidth={1.9} />
            <span className="flex-1">Your doctors</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-4 border-t border-line p-4">
            <ConnectedDoctors />
            <ChartAccessLog />
          </div>
        </details>

        {/* Past visits */}
        <details className="group row-group">
          <summary className="flex cursor-pointer list-none items-center gap-3 min-h-14 px-4 py-3 text-[17px] font-medium hover:bg-muted/50">
            <History className="h-5 w-5 text-stage-accent" strokeWidth={1.9} />
            <span className="flex-1">Past visits{loaded ? ` (${past.length})` : ''}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-line p-4">
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
          </div>
        </details>
      </div>

      <RescheduleDialog
        appointment={rescheduling}
        open={rescheduling !== null}
        onOpenChange={(open) => { if (!open) setRescheduling(null); }}
        onRescheduled={() => { emitHealthDataChange(); load(); }}
      />
    </div>
  );
};

export default Appointments;
