import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNowStrict } from 'date-fns';
import { CalendarX, X } from 'lucide-react';

// Symmetric to the patient-side cancellation surface on Notifications.
// When a patient cancels their own appointment, the row just disappears
// from the doctor's Upcoming list — until now the doctor had to scroll
// Past Appointments to notice. This banner sits at the top of the
// dashboard and flags recent patient-initiated cancellations so the
// doctor knows a slot just freed up.
//
// Patient-initiated cancellations have null notes (or anything not
// starting with the "Cancelled by doctor:" prefix). The doctor's own
// cancellations are filtered out — the doctor obviously already knows
// about those.

interface Appointment {
  id: string;
  patient_id: string;
  scheduled_at: string;
  status: string | null;
  consultation_type?: string | null;
  notes?: string | null;
}

interface PatientConnection {
  patient_id: string;
  patient_full_name?: string | null;
}

interface DoctorCancellationsBannerProps {
  appointments: Appointment[];
  patients: PatientConnection[];
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DISMISS_KEY_PREFIX = 'doctor_dismissed_cancellations_';

const DoctorCancellationsBanner = ({ appointments, patients }: DoctorCancellationsBannerProps) => {
  const { user } = useAuth();
  const dismissKey = user ? `${DISMISS_KEY_PREFIX}${user.id}` : null;

  // localStorage-backed dismissal set so a doctor who has already seen
  // the cancellation can hide it without losing the rest. Stored per-
  // user so multi-account browsers don't share state.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!dismissKey) return;
    try {
      const raw = localStorage.getItem(dismissKey);
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt JSON — start empty.
    }
  }, [dismissKey]);

  const dismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      if (dismissKey) {
        try {
          localStorage.setItem(dismissKey, JSON.stringify(Array.from(next)));
        } catch {
          // Quota — accept the in-memory dismissal.
        }
      }
      return next;
    });
  };

  const patientNameFor = (patientId: string): string => {
    const p = patients.find(c => c.patient_id === patientId);
    return p?.patient_full_name?.trim() || `Patient #${patientId.slice(0, 8)}`;
  };

  const cutoff = Date.now() - WINDOW_MS;
  const cancellations = appointments
    .filter(a => {
      if ((a.status ?? '').toLowerCase() !== 'cancelled') return false;
      // Doctor-initiated cancellations carry the prefix — exclude them.
      const notes = a.notes ?? '';
      if (/^Cancelled by doctor:/i.test(notes)) return false;
      // Only flag recent ones; older cancellations are no longer
      // actionable.
      const t = Date.parse(a.scheduled_at);
      if (!Number.isFinite(t) || t < cutoff) return false;
      // The slot has to have been in the future or present — a no-show
      // that got incorrectly marked cancelled shouldn't surface.
      return true;
    })
    .filter(a => !dismissed.has(a.id))
    .sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at));

  if (cancellations.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <CalendarX className="h-3.5 w-3.5 text-destructive" />
        {cancellations.length === 1
          ? 'A patient cancelled — slot freed'
          : `${cancellations.length} patients cancelled — slots freed`}
      </h2>
      <Card className="p-3 border-destructive/30 bg-destructive/5">
        <ul className="space-y-1.5">
          {cancellations.map(apt => {
            const when = new Date(apt.scheduled_at);
            return (
              <li key={apt.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{patientNameFor(apt.patient_id)}</span>
                  <span className="text-muted-foreground">
                    {' '}cancelled {when.toLocaleDateString()} at {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-muted-foreground"> · {formatDistanceToNowStrict(when, { addSuffix: true })}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => dismiss(apt.id)}
                  aria-label="Dismiss"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
};

export default DoctorCancellationsBanner;
