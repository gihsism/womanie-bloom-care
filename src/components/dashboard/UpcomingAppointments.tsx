import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/integrations/db/client';
import { CalendarClock, Video, MapPin, Stethoscope, ShieldCheck, X, CalendarCog } from 'lucide-react';
import RescheduleDialog from './RescheduleDialog';
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';
import { errorMessage } from '@/lib/errors';
import { emitHealthDataChange, onHealthDataChange } from '@/lib/data-events';

// Upcoming consultations on the patient dashboard. Patients can already
// book through FindDoctor but had nowhere to see their schedule after.
// Lists at most the next three; a "View all" hint links into FindDoctor
// when there are more. Hides itself entirely when there's nothing
// upcoming, so it stays out of the way for users who haven't booked.

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

const VISIBLE_LIMIT = 3;

function relativeDay(d: Date): string {
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  // Within the next 6 days, lead with the weekday so "Thursday" reads
  // more naturally than "Apr 24" for near-term appointments.
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days >= 0 && days < 7) return format(d, 'EEEE');
  return format(d, 'MMM d');
}

export default function UpcomingAppointments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<AppointmentRow | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const resp = await fetch('/api/me/appointments?upcoming=true');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      setRows((payload.appointments ?? []) as AppointmentRow[]);
    } catch (e) {
      console.error('Failed to load upcoming appointments:', e);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const setApptStatus = async (apt: AppointmentRow, next: string) => {
    const { error } = await db
      .from('appointments')
      .update({ status: next })
      .eq('id', apt.id);
    if (error) throw error;
  };

  const cancel = async (apt: AppointmentRow) => {
    const doctorLabel = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'this doctor';
    const when = format(new Date(apt.scheduled_at), 'PPP, p');
    if (!window.confirm(`Cancel your appointment with ${doctorLabel} on ${when}?`)) return;
    setBusyId(apt.id);
    try {
      await setApptStatus(apt, 'cancelled');
      toast({
        title: 'Appointment cancelled',
        description: `Your appointment with ${doctorLabel} on ${when} has been cancelled.`,
        action: (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await setApptStatus(apt, 'scheduled');
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

  if (!loaded || rows.length === 0) return null;

  const visible = rows.slice(0, VISIBLE_LIMIT);
  const hidden = rows.length - visible.length;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <CalendarClock className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {rows.length === 1 ? 'Upcoming appointment' : `${rows.length} upcoming appointments`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Your scheduled consultations. Cancel any time before the visit.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {visible.map(apt => {
          const when = new Date(apt.scheduled_at);
          const name = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'A doctor';
          const specialty = Array.isArray(apt.doctor_specialties) && apt.doctor_specialties.length > 0
            ? apt.doctor_specialties[0]
            : null;
          const isVideo = apt.consultation_type === 'video';
          return (
            <li
              key={apt.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20"
            >
              {apt.doctor_avatar_url ? (
                <img src={apt.doctor_avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="h-5 w-5 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium truncate">{name}</span>
                  {apt.doctor_verified && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-300">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                  {apt.payment_status === 'pending' && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px]">Payment pending</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {specialty || 'Doctor'}
                  {apt.duration ? ` · ${apt.duration} min` : ''}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="font-medium">{relativeDay(when)}</span>
                  <span className="text-muted-foreground">at {format(when, 'p')}</span>
                  <span className="text-[10px] text-muted-foreground">
                    · in {formatDistanceToNowStrict(when)}
                  </span>
                  <span className="inline-flex items-center gap-1 ml-1 text-[10px] text-muted-foreground">
                    {isVideo ? (
                      <><Video className="h-3 w-3" /> Video</>
                    ) : (
                      <><MapPin className="h-3 w-3" /> In person</>
                    )}
                  </span>
                </div>
              </div>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-muted-foreground hover:text-primary"
                  onClick={() => setRescheduling(apt)}
                  disabled={busyId === apt.id}
                  aria-label="Reschedule appointment"
                  title="Reschedule appointment"
                >
                  <CalendarCog className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => cancel(apt)}
                  disabled={busyId === apt.id}
                  aria-label="Cancel appointment"
                  title="Cancel appointment"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center justify-center gap-3">
        {hidden > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate('/dashboard/appointments')}
          >
            +{hidden} more
          </Button>
        )}
        <Button
          variant="link"
          size="sm"
          className="h-7 text-xs"
          onClick={() => navigate('/dashboard/appointments')}
        >
          See all appointments
        </Button>
      </div>

      <RescheduleDialog
        appointment={rescheduling}
        open={rescheduling !== null}
        onOpenChange={(open) => { if (!open) setRescheduling(null); }}
        onRescheduled={() => { emitHealthDataChange(); load(); }}
      />
    </Card>
  );
}
