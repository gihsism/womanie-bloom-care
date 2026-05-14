import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { format, isToday, formatDistanceToNowStrict, differenceInMinutes } from 'date-fns';
import { CalendarClock, Video, MapPin, User, AlertCircle } from 'lucide-react';

// Symmetric to AppointmentTodayBanner on the patient side: shows the
// doctor their consultations scheduled for today, with imminent-slot
// emphasis. The doctor already owns the appointment rows so we can take
// the in-memory `appointments` + `patients` arrays from DoctorDashboard
// rather than re-fetching.

interface Appointment {
  id: string;
  patient_id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type: string | null;
  duration: number | null;
}

interface PatientConnection {
  patient_id: string;
  patient_full_name?: string | null;
}

interface DoctorTodayBannerProps {
  appointments: Appointment[];
  patients: PatientConnection[];
}

const DoctorTodayBanner = ({ appointments, patients }: DoctorTodayBannerProps) => {
  const navigate = useNavigate();

  const patientNameFor = (patientId: string): string => {
    const p = patients.find(c => c.patient_id === patientId);
    return p?.patient_full_name?.trim() || `Patient #${patientId.slice(0, 8)}`;
  };

  // Re-tick once a minute so "in N minutes" stays accurate without a refresh.
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const todays = appointments
    .filter((a) => {
      if ((a.status ?? '').toLowerCase() === 'cancelled') return false;
      return isToday(new Date(a.scheduled_at));
    })
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  if (todays.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Today's consultations ({todays.length})
      </h2>
      {todays.map((apt) => {
        const when = new Date(apt.scheduled_at);
        const minutesAway = differenceInMinutes(when, new Date());
        const name = patientNameFor(apt.patient_id);
        const isVideo = apt.consultation_type === 'video';
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
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
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
                <p className="text-sm font-semibold mt-0.5">{name}</p>
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
                    Start call
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[11px] h-7"
                  onClick={() => navigate(`/doctor/patient/${apt.patient_id}`)}
                >
                  View patient
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default DoctorTodayBanner;
