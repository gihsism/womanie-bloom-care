import { DATE_FMT } from '@/lib/dateFormat';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Shield, Plus, Check, AlertCircle, CalendarClock } from 'lucide-react';
import { format, addMonths, differenceInDays, parseISO } from 'date-fns';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';

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
    description: 'Every 2 years from 40 to 74 (USPSTF 2024). In Switzerland, many cantons run programmes that invite women from 50 every 2 years; basic insurance pays for these programme mammograms with no deductible, the co-payment still applies (KLV Art. 12e). Can find breast cancer before it can be felt.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'dexa',
    label: 'DEXA bone density',
    cadenceMonths: 24,
    description: 'Bone density scan (DXA). Recommended from 65, and earlier after menopause if a risk check shows a higher fracture risk, e.g. smoking, low body weight, a parent with a hip fracture (USPSTF 2025). How often to repeat it depends on your result and treatment; no guideline sets one interval for everyone, so the 2-year reminder here is an app reminder. In Switzerland, basic insurance pays for DXA only for set reasons (e.g. a fracture after a minor fall, long-term cortisone, low sex hormones), and repeat scans at most every 2 years while the risk lasts (KLV Annex 1).',
    scopes: ['post-menopause'],
  },
  {
    id: 'colonoscopy',
    label: 'Colonoscopy',
    cadenceMonths: 120,
    description: 'Every 10 years from 45 if average risk (USPSTF 2021). In Switzerland, screening from 50 is covered by basic insurance (a colonoscopy every 10 years or a stool blood test every 2 years), and many cantons run programmes; ask your doctor about the age limits. More often if you have a family history of colorectal cancer.',
    scopes: ['post-menopause', 'general'],
  },
  {
    id: 'pap',
    label: 'Pap smear + HPV',
    cadenceMonths: 36,
    description: 'In Switzerland every 3 years from 21 to 70 if results are normal: a cell test (Pap) from 21 to 29, a Pap or an HPV test from 30; both together is not recommended (SGGG 2026). Basic insurance pays for the smear (yearly for the first two, then every 3 years) but not for an HPV test used for screening (KLV Art. 12e). Ask your gynaecologist what fits you.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'cholesterol',
    label: 'Lipid panel',
    cadenceMonths: 60,
    description: 'Often checked about every 5 years in average-risk adults (guidelines differ, so this is an app reminder); more often if you have heart-disease risk factors.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'blood-pressure',
    label: 'Blood pressure',
    cadenceMonths: 12,
    description: 'At least once a year from 40 (USPSTF 2021); home monitoring if your last reading was elevated.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'thyroid',
    label: 'Thyroid (TSH)',
    cadenceMonths: 60,
    description: 'No routine test is recommended for adults without symptoms (USPSTF: not enough evidence), so the 5-year reminder is an app reminder. Ask for a test if you have symptoms such as tiredness or weight changes, or a family history of thyroid disease.',
    scopes: ['post-menopause', 'menopause', 'general'],
  },
  {
    id: 'diabetes',
    label: 'Diabetes (HbA1c)',
    cadenceMonths: 36,
    description: 'About every 3 years from 35 (American Diabetes Association; USPSTF 2021 for adults 35-70 with overweight). Earlier and more often with overweight, a family history, earlier gestational diabetes or PCOS.',
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

  const accountVersion = useAccountDataVersion([userId ? KEY(userId) : null]);
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
  }, [userId, accountVersion]);

  const persist = (next: Record<string, ScreeningRecord>) => {
    setRecords(next);
    if (!userId) return;
    try {
      localStorage.setItem(KEY(userId), JSON.stringify(next));
      pushAccountData(userId, KEY(userId));
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
        Intervals follow US (USPSTF) general-population advice where a guideline sets one;
        otherwise they are app reminders. Swiss programmes and your doctor may suggest a
        different schedule based on your personal and family history.
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
                      Last done {format(lastDone, DATE_FMT)}
                      {nextDue && ` · Next due ${format(nextDue, 'MMM yyyy')}`}
                    </p>
                  )}
                </div>
              </div>
              {/* Wraps on phones so the date stays readable and the button stays inside the card. */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex flex-1 basis-[14rem] items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
                  Mark as done on
                  <input
                    type="date"
                    max={format(new Date(), 'yyyy-MM-dd')}
                    defaultValue={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (e.target.value) markDone(s.id, e.target.value);
                    }}
                    className="px-2 py-1 border rounded bg-background text-foreground text-xs flex-1 min-w-[7.5rem]"
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 shrink-0"
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
