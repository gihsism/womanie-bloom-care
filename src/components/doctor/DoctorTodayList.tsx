import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarClock, CalendarX, ChevronRight, ClipboardCheck, FileText, X } from 'lucide-react';
import {
  doctorTodayItems,
  type DoctorAppointment,
  type DoctorPatientConnection,
  type TodayItem,
} from '@/lib/doctorDashboard';

// The doctor's "Today": one ranked list of what needs her (visits today,
// visits to close, patient cancellations, new uploads). Shows 3 rows and
// a "Show N more" link. Replaces DoctorTodayBanner + DoctorCancellationsBanner.

const MAX_ROWS = 3;
// Same key the old cancellations banner used, so earlier dismissals stick.
const DISMISS_KEY_PREFIX = 'doctor_dismissed_cancellations_';

const ICONS = {
  visit: CalendarClock,
  closeout: ClipboardCheck,
  cancelled: CalendarX,
  uploads: FileText,
} as const;

interface Props {
  appointments: DoctorAppointment[];
  patients: DoctorPatientConnection[];
  onOpenAppointments: () => void;
}

function useDismissedCancellations() {
  const { user } = useAuth();
  const key = user ? `${DISMISS_KEY_PREFIX}${user.id}` : null;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt JSON or blocked storage: start empty.
    }
  }, [key]);
  const dismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      if (key) {
        try {
          localStorage.setItem(key, JSON.stringify(Array.from(next)));
        } catch {
          // Quota: keep the in-memory dismissal.
        }
      }
      return next;
    });
  };
  return { dismissed, dismiss };
}

const DoctorTodayList = ({ appointments, patients, onOpenAppointments }: Props) => {
  const navigate = useNavigate();
  const { dismissed, dismiss } = useDismissedCancellations();
  const [expanded, setExpanded] = useState(false);

  // Re-render once a minute so "in 10 min" stays true.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const items = doctorTodayItems({ appointments, patients, now, dismissedCancellations: dismissed });
  const visible = expanded ? items : items.slice(0, MAX_ROWS);

  const open = (item: TodayItem) => {
    if (item.kind === 'closeout' || item.kind === 'cancelled') onOpenAppointments();
    else if (item.kind === 'uploads') navigate(`/doctor/patient/${item.patientId}?tab=documents`);
    else navigate(`/doctor/patient/${item.patientId}`);
  };

  return (
    <section aria-labelledby="doctor-today-heading" className="space-y-2">
      <h2 id="doctor-today-heading" className="section-title">Today</h2>
      {items.length === 0 ? (
        <p className="row-group px-4 py-4 text-[15px] text-muted-foreground">Nothing needs you right now.</p>
      ) : (
        <div className="row-group">
          {visible.map(item => {
            const Icon = ICONS[item.kind];
            return (
              <div
                key={item.key}
                className={`flex items-center gap-1 ${item.startingSoon ? 'bg-stage-tint' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="flex flex-1 min-w-0 items-center gap-3 min-h-14 px-4 py-3 text-left hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stage-accent"
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${item.kind === 'cancelled' ? 'text-destructive' : 'text-stage-accent'}`}
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-medium truncate">{item.title}</span>
                    <span className="block text-[14px] text-muted-foreground truncate">{item.detail}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
                {item.kind === 'cancelled' && item.appointmentId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10 w-10 p-0 mr-2 text-muted-foreground"
                    onClick={() => dismiss(item.appointmentId!)}
                    aria-label="Hide this cancellation"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {items.length > MAX_ROWS && (
            <button
              type="button"
              onClick={() => setExpanded(e => !e)}
              className="w-full min-h-12 px-4 text-[15px] font-semibold text-stage-accent hover:bg-muted/50"
            >
              {expanded ? 'Show less' : `Show ${items.length - MAX_ROWS} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default DoctorTodayList;
