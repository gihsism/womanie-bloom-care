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
} from 'lucide-react';

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
  doctor_name: string | null;
  doctor_title: string | null;
  doctor_specialties: string[] | null;
  doctor_avatar_url: string | null;
  doctor_verified: boolean | null;
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

const Appointments = () => {
  const navigate = useNavigate();
  usePageTitle('My Appointments');
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const cancel = async (apt: AppointmentRow) => {
    const doctorLabel = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'this doctor';
    const when = format(new Date(apt.scheduled_at), 'PPP, p');
    if (!window.confirm(`Cancel your appointment with ${doctorLabel} on ${when}? This can't be undone.`)) return;
    setBusyId(apt.id);
    try {
      const { error } = await db
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', apt.id);
      if (error) throw error;
      toast({ title: 'Appointment cancelled', description: `Your appointment with ${doctorLabel} has been cancelled.` });
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
    const isCancelled = (apt.status ?? '').toLowerCase() === 'cancelled';

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
        </div>
        {kind === 'upcoming' && !isCancelled && (
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
          {!loaded ? (
            <Skeleton className="h-20 w-full" />
          ) : past.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Past appointments will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {past.slice(0, 50).map(apt => renderAppointment(apt, 'past'))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default Appointments;
