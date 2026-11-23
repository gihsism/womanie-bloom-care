import { Card } from '@/components/ui/card';
import { Calendar, Video } from 'lucide-react';
import type { PatientAppointment } from './types';

// Visits tab: every visit with this doctor, newest first (the API already
// orders scheduled_at DESC). Status in plain words, shown once.

const STATUS: Record<string, string> = {
  completed: 'Completed',
  no_show: "Didn't come",
  cancelled: 'Cancelled',
  scheduled: 'Booked',
};

const PatientVisits = ({ appointments }: { appointments: PatientAppointment[] }) => {
  if (appointments.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">No visits with this patient yet.</Card>;
  }
  const now = Date.now();
  return (
    <Card className="divide-y">
      {appointments.map(apt => {
        const when = new Date(apt.scheduled_at);
        const s = (apt.status || 'scheduled').toLowerCase();
        const label = s === 'scheduled' && when.getTime() < now ? 'Not closed yet' : STATUS[s] ?? apt.status;
        const Icon = apt.consultation_type === 'video' ? Video : Calendar;
        return (
          <div key={apt.id} className={`flex items-start gap-3 p-3 ${s === 'cancelled' ? 'opacity-60' : ''}`}>
            <Icon className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {when.toLocaleDateString()} at {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-xs text-muted-foreground">
                {apt.consultation_type === 'video' ? 'Video' : 'In person'} · {label}
              </p>
              {apt.notes && <p className="text-xs text-muted-foreground mt-1">{apt.notes}</p>}
            </div>
          </div>
        );
      })}
    </Card>
  );
};

export default PatientVisits;
