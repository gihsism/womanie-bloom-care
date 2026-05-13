import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';
import { onHealthDataChange } from '@/lib/data-events';
import { format, isToday, formatDistanceToNowStrict, differenceInMinutes } from 'date-fns';
import { CalendarClock, Video, MapPin, Stethoscope, AlertCircle } from 'lucide-react';

// Day-of reminder for appointments. Pulls upcoming consultations, keeps
// only the ones scheduled today, and renders a prominent banner above
// the rest of the dashboard. Gated by the appointmentReminders
// notification toggle, which was previously decorative.

interface AppointmentRow {
  id: string;
  doctor_id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type: string | null;
  duration: number | null;
  doctor_name: string | null;
  doctor_title: string | null;
  doctor_avatar_url: string | null;
}

const AppointmentTodayBanner = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const prefs = useNotificationPrefs();
  const [todays, setTodays] = useState<AppointmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      const resp = await fetch('/api/me/appointments?upcoming=true');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      const all = (payload.appointments ?? []) as AppointmentRow[];
      setTodays(
        all.filter((a) => {
          if ((a.status ?? '').toLowerCase() === 'cancelled') return false;
          return isToday(new Date(a.scheduled_at));
        })
      );
    } catch (e) {
      console.error('AppointmentTodayBanner load error', e);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Re-tick once a minute so "in 8 minutes" stays accurate without a refresh.
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!prefs.appointmentReminders) return null;
  if (!loaded || todays.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {todays.map((apt) => {
        const when = new Date(apt.scheduled_at);
        const minutesAway = differenceInMinutes(when, new Date());
        const name = [apt.doctor_title, apt.doctor_name].filter(Boolean).join(' ') || 'A doctor';
        const isVideo = apt.consultation_type === 'video';
        // "Imminent" means within the next 15 minutes — boost the styling
        // and surface the Join button prominently.
        const imminent = minutesAway >= -5 && minutesAway <= 15;
        const inProgress = minutesAway < 0 && apt.duration && minutesAway > -apt.duration;

        return (
          <Card
            key={apt.id}
            className={`p-4 ${
              imminent
                ? 'border-primary bg-primary/5'
                : 'border-primary/30 bg-primary/[0.03]'
            }`}
          >
            <div className="flex items-start gap-3">
              {apt.doctor_avatar_url ? (
                <img
                  src={apt.doctor_avatar_url}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="h-5 w-5 text-primary" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {imminent ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wide">
                      <AlertCircle className="h-3 w-3" />
                      Starting soon
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      <CalendarClock className="h-3 w-3" />
                      Today
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold mt-0.5">Consultation with {name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(when, 'p')}
                  {minutesAway > 0 && ` · in ${formatDistanceToNowStrict(when)}`}
                  {inProgress && ' · in progress'}
                  {apt.duration ? ` · ${apt.duration} min` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                  {isVideo ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                  {isVideo ? 'Video consultation' : 'In-person'}
                </p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                {isVideo && imminent && (
                  <Button size="sm" className="gap-1.5 h-8">
                    <Video className="h-3.5 w-3.5" />
                    Join call
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[11px] h-7"
                  onClick={() => navigate('/dashboard/appointments')}
                >
                  Details
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default AppointmentTodayBanner;
