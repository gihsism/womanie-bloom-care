import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Shield, Plus, Check, AlertCircle, CalendarClock } from 'lucide-react';
import { format, addMonths, differenceInDays, parseISO } from 'date-fns';

// Screening tracker for post-menopause / general adult preventive
// care. The Post-Menopause dashboard already listed the screenings as
// static cards in a "Screening Reminder" callout — useful info but no
// way to record what's been done or when the next one is due.
//
// Stored in per-user localStorage keyed by screening type. When the
// schema gets an `appointments` extension or a dedicated screenings
// table this swaps out cleanly.

interface ScreeningTrackerProps {
  // For post-menopause we use the full screening list; other modes
  // (menopause, pregnancy etc.) get a curated subset.
  scope: 'post-menopause' | 'menopause' | 'general';
}

interface ScreeningType {
  id: string;
  label: string;
  cadenceMonths: number;
  description: string;
  scopes: ScreeningTrackerProps['scope'][];
}

const SCREENINGS: ScreeningType[] = [
  {
    id: 'mammogram',
    label: 'Mammogram',
    cadenceMonths: 24,
    description: 'Every 1–2 years from 40, every 1–2 years through 74. Catches early breast cancer well before it can be felt.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'dexa',
    label: 'DEXA bone density',
    cadenceMonths: 24,
    description: 'Bone mineral density scan. Recommended every 2 years post-menopause — earlier if you have risk factors (smoker, low BMI, family history).',
    scopes: ['post-menopause'],
  },
  {
    id: 'colonoscopy',
    label: 'Colonoscopy',
    cadenceMonths: 120,
    description: 'Every 10 years from 45 if average risk. More often if you have a family history of colorectal cancer.',
    scopes: ['post-menopause', 'general'],
  },
  {
    id: 'pap',
    label: 'Pap smear + HPV',
    cadenceMonths: 36,
    description: 'Every 3 years (Pap alone) or every 5 years (Pap + HPV co-test) through 65 if previous results were normal.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'cholesterol',
    label: 'Lipid panel',
    cadenceMonths: 60,
    description: 'Every 5 years for average-risk adults; more often if you have heart-disease risk factors.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'blood-pressure',
    label: 'Blood pressure',
    cadenceMonths: 12,
    description: 'Annual reading at minimum; home monitoring if your last reading was elevated.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'thyroid',
    label: 'Thyroid (TSH)',
    cadenceMonths: 60,
    description: 'Every 5 years for low-risk adults; more often if you have a family history or symptoms like fatigue or weight changes.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'diabetes',
    label: 'Diabetes (HbA1c)',
    cadenceMonths: 36,
    description: 'Every 3 years from 35 if average risk. Earlier and more often if BMI ≥25, family history, or PCOS history.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
];

interface ScreeningRecord {
  lastDone: string | null;       // YYYY-MM-DD
}

const KEY = (uid: string) => `womanie_screenings_${uid}`;

const ScreeningTracker = ({ scope }: ScreeningTrackerProps) => {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [records, setRecords] = useState<Record<string, ScreeningRecord>>({});

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(KEY(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, ScreeningRecord>;
        setRecords(parsed);
      }
    } catch {
      // Corrupt JSON — start empty.
    }
  }, [userId]);

  const persist = (next: Record<string, ScreeningRecord>) => {
    setRecords(next);
    if (!userId) return;
    try {
      localStorage.setItem(KEY(userId), JSON.stringify(next));
    } catch {
      // Quota / private mode — accept in-memory state.
    }
  };

  const markDone = (id: string, date: string) => {
    persist({ ...records, [id]: { lastDone: date } });
    const screening = SCREENINGS.find(s => s.id === id);
    if (screening) {
      const due = addMonths(parseISO(date), screening.cadenceMonths);
      toast({
        title: `${screening.label} logged`,
        description: `Next due ${format(due, 'MMM yyyy')}.`,
      });
    }
  };

  const relevant = SCREENINGS.filter(s => s.scopes.includes(scope));

  // Compute status for each: never done / overdue / due soon / up to date.
  const today = new Date();
  const items = relevant.map(s => {
    const rec = records[s.id];
    if (!rec?.lastDone) return { s, status: 'never' as const, lastDone: null, nextDue: null, daysUntilDue: 0 };
    const last = parseISO(rec.lastDone);
    const next = addMonths(last, s.cadenceMonths);
    const days = differenceInDays(next, today);
    let status: 'overdue' | 'due-soon' | 'up-to-date';
    if (days < 0) status = 'overdue';
    else if (days <= 60) status = 'due-soon';
    else status = 'up-to-date';
    return { s, status, lastDone: last, nextDue: next, daysUntilDue: days };
  });

  // Sort: overdue first, then due-soon, then never (so user sees what
  // matters first), then up-to-date last.
  const order: Record<string, number> = { overdue: 0, 'due-soon': 1, never: 2, 'up-to-date': 3 };
  items.sort((a, b) => order[a.status] - order[b.status]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Preventive screening
        </h4>
        <Badge variant="outline" className="text-[10px]">
          Tap a screening when you complete it
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground -mt-1">
        Cadences are USPSTF / ACS general-population recommendations — your provider may
        suggest a different schedule based on your personal and family history.
      </p>

      <ul className="space-y-2">
        {items.map(({ s, status, lastDone, nextDue, daysUntilDue }) => {
          const statusBadge =
            status === 'overdue' ? (
              <Badge variant="destructive" className="text-[10px]">
                Overdue by {Math.abs(daysUntilDue)}d
              </Badge>
            ) : status === 'due-soon' ? (
              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-300">
                Due in {daysUntilDue}d
              </Badge>
            ) : status === 'never' ? (
              <Badge variant="outline" className="text-[10px]">
                Not logged
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700 dark:text-emerald-300">
                Up to date
              </Badge>
            );
          const StatusIcon =
            status === 'overdue' || status === 'due-soon' ? AlertCircle :
            status === 'up-to-date' ? Check :
            CalendarClock;
          const statusIconClass =
            status === 'overdue' ? 'text-destructive' :
            status === 'due-soon' ? 'text-amber-600' :
            status === 'up-to-date' ? 'text-emerald-600' :
            'text-muted-foreground';
          return (
            <li
              key={s.id}
              className={`border rounded-lg p-3 space-y-2 ${
                status === 'overdue' ? 'border-destructive/30 bg-destructive/5' :
                status === 'due-soon' ? 'border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10' :
                'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusIcon className={`h-4 w-4 ${statusIconClass}`} />
                    <span className="text-sm font-medium">{s.label}</span>
                    {statusBadge}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {s.description}
                  </p>
                  {lastDone && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Last done {format(lastDone, 'MMM d, yyyy')}
                      {nextDue && ` · Next due ${format(nextDue, 'MMM yyyy')}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex-1 text-[11px] text-muted-foreground flex items-center gap-2">
                  Mark as done on
                  <input
                    type="date"
                    max={format(new Date(), 'yyyy-MM-dd')}
                    defaultValue={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (e.target.value) markDone(s.id, e.target.value);
                    }}
                    className="px-2 py-1 border rounded bg-background text-foreground text-xs flex-1 min-w-0"
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => markDone(s.id, format(new Date(), 'yyyy-MM-dd'))}
                >
                  <Plus className="h-3 w-3" />
                  Done today
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export default ScreeningTracker;
