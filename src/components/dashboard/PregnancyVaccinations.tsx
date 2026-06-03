import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, format, parseISO } from 'date-fns';
import { Syringe, Check, Clock, Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

// Pregnancy vaccination checklist — Tdap (27–36w), flu (any
// trimester, seasonal), RSV / Abrysvo (32–36w, seasonal), Hep B if
// indicated. Following ACOG / CDC current guidance (2024–2025
// season). We can't dispense or schedule shots; what we can do is
// surface the window per shot, prompt at the right gestational
// week, and let the patient mark what's been received so it stops
// nudging.
//
// Renders for pregnancy mode only.

interface PregnancyVaccinationsProps {
  dueDate: Date | null;
}

interface Vaccine {
  key: string;
  label: string;
  fullName: string;
  windowStartWeek: number;
  windowEndWeek: number;
  rationale: string;
  cadence: 'every-pregnancy' | 'once-per-season' | 'as-indicated';
}

const VACCINES: Vaccine[] = [
  {
    key: 'tdap',
    label: 'Tdap',
    fullName: 'Tetanus / Diphtheria / Pertussis booster',
    windowStartWeek: 27,
    windowEndWeek: 36,
    rationale:
      'Given every pregnancy regardless of prior shots — antibodies cross the placenta and protect baby from pertussis (whooping cough) in the first months before they can be vaccinated.',
    cadence: 'every-pregnancy',
  },
  {
    key: 'flu',
    label: 'Flu',
    fullName: 'Seasonal influenza (inactivated)',
    windowStartWeek: 0,
    windowEndWeek: 40,
    rationale:
      'Recommended at any gestational age during flu season. Pregnant patients are at higher risk for severe flu; vaccination also passes protection to baby.',
    cadence: 'once-per-season',
  },
  {
    key: 'rsv',
    label: 'RSV (Abrysvo)',
    fullName: 'Maternal RSV (Pfizer Abrysvo)',
    windowStartWeek: 32,
    windowEndWeek: 36,
    rationale:
      'Single-dose maternal RSV vaccine during the recommended window passes antibodies to baby. Alternative is monoclonal antibody (nirsevimab) for the infant after birth — discuss with OB which path fits.',
    cadence: 'once-per-season',
  },
  {
    key: 'covid',
    label: 'COVID-19',
    fullName: 'COVID-19 (current formula)',
    windowStartWeek: 0,
    windowEndWeek: 40,
    rationale:
      'CDC recommends pregnant patients stay current with the most recent COVID-19 vaccine. Pregnancy raises the risk of severe COVID-19.',
    cadence: 'once-per-season',
  },
];

interface VaccineStatus {
  receivedDate?: string; // yyyy-MM-dd
  declined?: boolean;
}

type VaccineState = Record<string, VaccineStatus>;

const STORAGE_KEY = (userId: string) => `womanie_preg_vaccinations_${userId}`;

export default function PregnancyVaccinations({ dueDate }: PregnancyVaccinationsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<VaccineState>({});

  useEffect(() => {
    if (!user) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(user.id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setState(parsed);
      }
    } catch { /* ignore */ }
  }, [user]);

  const persist = (next: VaccineState) => {
    if (!user) return;
    try { window.localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ }
    setState(next);
  };

  // Gestational week from due date.
  const gestWeek = useMemo(() => {
    if (!dueDate) return null;
    const start = new Date(dueDate);
    start.setDate(start.getDate() - 280);
    const days = differenceInDays(new Date(), start);
    if (days < 0 || days > 320) return null;
    return Math.floor(days / 7);
  }, [dueDate]);

  const markReceived = (key: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    persist({ ...state, [key]: { receivedDate: today } });
    toast({ title: 'Marked received', description: `${VACCINES.find(v => v.key === key)?.label} on ${format(new Date(), 'MMM d, yyyy')}.` });
  };
  const markDeclined = (key: string) => {
    persist({ ...state, [key]: { declined: true } });
  };
  const undo = (key: string) => {
    const next = { ...state };
    delete next[key];
    persist(next);
  };

  // Status per vaccine: received / declined / due-now / upcoming / past-due.
  type StatusKey = 'received' | 'declined' | 'due_now' | 'upcoming' | 'past_due' | 'not_yet';
  const getStatus = (v: Vaccine): { key: StatusKey; label: string; color: string } => {
    if (state[v.key]?.receivedDate) {
      return {
        key: 'received',
        label: `Received ${format(parseISO(state[v.key].receivedDate!), 'MMM d, yyyy')}`,
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
      };
    }
    if (state[v.key]?.declined) {
      return {
        key: 'declined',
        label: 'Marked not now',
        color: 'bg-muted text-muted-foreground',
      };
    }
    if (gestWeek === null) {
      return { key: 'not_yet', label: 'Due date needed', color: 'bg-muted text-muted-foreground' };
    }
    if (gestWeek < v.windowStartWeek) {
      const weeksAway = v.windowStartWeek - gestWeek;
      return {
        key: 'upcoming',
        label: `Due in ${weeksAway} week${weeksAway === 1 ? '' : 's'}`,
        color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
      };
    }
    if (gestWeek > v.windowEndWeek) {
      return {
        key: 'past_due',
        label: 'Window passed — ask your OB',
        color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
      };
    }
    return {
      key: 'due_now',
      label: 'Due now',
      color: 'bg-primary/15 text-primary',
    };
  };

  if (!dueDate || gestWeek === null) return null;

  // Sort: due now first, then upcoming, then past-due, then received/declined.
  const ranked = [...VACCINES].sort((a, b) => {
    const order: Record<StatusKey, number> = {
      due_now: 0,
      upcoming: 1,
      past_due: 2,
      not_yet: 3,
      received: 4,
      declined: 5,
    };
    return order[getStatus(a).key] - order[getStatus(b).key];
  });

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Syringe className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Pregnancy vaccinations</p>
          <p className="text-[11px] text-muted-foreground">
            ACOG / CDC recommendations · week {gestWeek}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {ranked.map(v => {
          const status = getStatus(v);
          return (
            <li key={v.key} className="border rounded-lg p-3 bg-card">
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{v.label}</span>
                  <span className="text-[10px] text-muted-foreground">{v.fullName}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                <Clock className="h-3 w-3 inline mr-1 -mt-0.5" />
                Window: weeks {v.windowStartWeek === 0 ? 'any' : v.windowStartWeek}
                {v.windowStartWeek === 0 ? '' : `–${v.windowEndWeek}`}
                {' · '}{v.cadence === 'every-pregnancy' ? 'every pregnancy' : v.cadence === 'once-per-season' ? 'once per season' : 'as indicated'}
              </p>
              <p className="text-[11px] text-muted-foreground mb-2">{v.rationale}</p>
              {status.key !== 'received' && status.key !== 'declined' && (
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => markReceived(v.key)}>
                    <Check className="h-3 w-3 mr-1" />
                    Mark received
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => markDeclined(v.key)}>
                    Not now
                  </Button>
                </div>
              )}
              {(status.key === 'received' || status.key === 'declined') && (
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" onClick={() => undo(v.key)}>
                  Undo
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          Reference: ACOG / CDC immunization schedules for pregnancy (2024–2025). Status is tracked
          on this device — share with your OB at the next visit. Schedules update annually.
        </span>
      </p>
    </Card>
  );
}
