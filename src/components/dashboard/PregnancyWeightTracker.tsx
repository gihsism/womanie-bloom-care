import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, format, parseISO } from 'date-fns';
import { Scale, Info, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Pregnancy weight-gain tracker against IOM 2009 guidelines.
//
// The pregnancy mode dashboard tracks fetal growth (PregnancyTracker)
// and gestational milestones, but it doesn't help the patient see
// how her own weight gain is tracking against guidelines — which is
// what her OB will actually ask about at each visit. IOM 2009 sets
// total gestational gain by pre-pregnancy BMI, with weekly targets
// for the second + third trimesters.
//
// We need three inputs the user gives us:
//   1. Pre-pregnancy weight (anchor for total gain)
//   2. Height (for BMI calculation)
//   3. Unit preference (kg/cm vs lb/in)
//
// Everything lives in localStorage scoped per user.id until the
// profiles schema picks up dedicated columns (HANDOFF).
//
// Renders only for pregnancy mode + when we know the gestational
// week and the user has set up at least the anchor weight + height.

interface PregnancyWeightTrackerProps {
  dueDate: Date | null;
}

type Unit = 'metric' | 'us';

interface WeightSetup {
  prePregKg: number | null;
  heightCm: number | null;
  unit: Unit;
}

interface WeightEntry {
  date: string; // yyyy-MM-dd
  kg: number;
}

const SETUP_KEY = (userId: string) => `womanie_preg_weight_setup_${userId}`;
const LOG_KEY = (userId: string) => `womanie_preg_weight_log_${userId}`;

// IOM 2009 weekly gain (kg/week) and total gain ranges by pre-preg BMI.
// Source: Institute of Medicine, Weight Gain During Pregnancy, 2009.
const IOM_RANGES = {
  underweight: { totalKg: [12.5, 18], weeklyKg: [0.44, 0.58], label: 'Underweight (BMI <18.5)' },
  normal:      { totalKg: [11.5, 16], weeklyKg: [0.35, 0.50], label: 'Normal (BMI 18.5–24.9)' },
  overweight:  { totalKg: [7, 11.5],  weeklyKg: [0.23, 0.33], label: 'Overweight (BMI 25–29.9)' },
  obese:       { totalKg: [5, 9],     weeklyKg: [0.17, 0.27], label: 'Obese (BMI ≥30)' },
} as const;

type BmiCategory = keyof typeof IOM_RANGES;

function categorizeBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

function kgToLb(kg: number): number { return kg * 2.20462; }
function lbToKg(lb: number): number { return lb / 2.20462; }
function cmToIn(cm: number): number { return cm / 2.54; }
function inToCm(inches: number): number { return inches * 2.54; }

export default function PregnancyWeightTracker({ dueDate }: PregnancyWeightTrackerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [setup, setSetup] = useState<WeightSetup>({ prePregKg: null, heightCm: null, unit: 'metric' });
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [draftPre, setDraftPre] = useState('');
  const [draftHeight, setDraftHeight] = useState('');
  const [todayValue, setTodayValue] = useState('');

  // Initial load from localStorage.
  useEffect(() => {
    if (!user) return;
    try {
      const rawSetup = window.localStorage.getItem(SETUP_KEY(user.id));
      if (rawSetup) {
        const parsed = JSON.parse(rawSetup) as Partial<WeightSetup>;
        if (parsed && typeof parsed === 'object') {
          setSetup({
            prePregKg: typeof parsed.prePregKg === 'number' ? parsed.prePregKg : null,
            heightCm: typeof parsed.heightCm === 'number' ? parsed.heightCm : null,
            unit: parsed.unit === 'us' ? 'us' : 'metric',
          });
        }
      }
      const rawLog = window.localStorage.getItem(LOG_KEY(user.id));
      if (rawLog) {
        const parsed = JSON.parse(rawLog);
        if (Array.isArray(parsed)) setEntries(parsed.filter(e => e?.date && typeof e?.kg === 'number'));
      }
    } catch { /* ignore */ }
  }, [user]);

  const persistSetup = useCallback((next: WeightSetup) => {
    if (!user) return;
    try { window.localStorage.setItem(SETUP_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ }
    setSetup(next);
  }, [user]);

  const persistEntries = useCallback((next: WeightEntry[]) => {
    if (!user) return;
    try { window.localStorage.setItem(LOG_KEY(user.id), JSON.stringify(next)); } catch { /* ignore */ }
    setEntries(next);
  }, [user]);

  const bmi = useMemo(() => {
    if (!setup.prePregKg || !setup.heightCm) return null;
    const m = setup.heightCm / 100;
    return setup.prePregKg / (m * m);
  }, [setup.prePregKg, setup.heightCm]);

  const category = bmi ? categorizeBmi(bmi) : null;

  // Gestational week from due date (40 weeks term).
  const gestWeek = useMemo(() => {
    if (!dueDate) return null;
    const conceptionStart = new Date(dueDate);
    conceptionStart.setDate(conceptionStart.getDate() - 280);
    const days = differenceInDays(new Date(), conceptionStart);
    if (days < 0 || days > 320) return null;
    return Math.floor(days / 7);
  }, [dueDate]);

  // Latest logged weight (sorted by date desc).
  const latest = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0] ?? null;
  }, [entries]);

  // Expected gain range *to date* given gestational week + BMI cat.
  // 1st trimester gains are small + lumped (0.5–2 kg); from week 13
  // onward we apply weekly targets.
  const expectedGain = useMemo(() => {
    if (!category || gestWeek === null) return null;
    const range = IOM_RANGES[category];
    if (gestWeek <= 13) {
      // First-trimester total: 0.5–2 kg (IOM general).
      return { lowKg: 0.5, highKg: 2.0, source: 'first-trimester total (0.5–2 kg)' };
    }
    const weeksPastFirst = gestWeek - 13;
    const firstTriLow = 0.5;
    const firstTriHigh = 2.0;
    return {
      lowKg: firstTriLow + weeksPastFirst * range.weeklyKg[0],
      highKg: firstTriHigh + weeksPastFirst * range.weeklyKg[1],
      source: `first-trimester 0.5–2 kg + ${weeksPastFirst} weeks × ${range.weeklyKg[0]}–${range.weeklyKg[1]} kg/wk`,
    };
  }, [category, gestWeek]);

  // Actual gain vs pre-pregnancy weight.
  const actualGainKg = useMemo(() => {
    if (!latest || !setup.prePregKg) return null;
    return latest.kg - setup.prePregKg;
  }, [latest, setup.prePregKg]);

  // Status pill colour
  const statusInfo = useMemo(() => {
    if (actualGainKg === null || !expectedGain) return null;
    if (actualGainKg < expectedGain.lowKg - 1) {
      return { color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200', label: 'Below range' };
    }
    if (actualGainKg > expectedGain.highKg + 1) {
      return { color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200', label: 'Above range' };
    }
    return { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200', label: 'On target' };
  }, [actualGainKg, expectedGain]);

  const fmtWeight = (kg: number): string => setup.unit === 'us' ? `${kgToLb(kg).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
  const fmtGain = (kg: number): string => {
    const sign = kg >= 0 ? '+' : '';
    return setup.unit === 'us' ? `${sign}${kgToLb(kg).toFixed(1)} lb` : `${sign}${kg.toFixed(1)} kg`;
  };

  const handleSaveSetup = () => {
    const pre = parseFloat(draftPre.replace(',', '.'));
    const heightNum = parseFloat(draftHeight.replace(',', '.'));
    if (!Number.isFinite(pre) || pre <= 0 || pre > 400) {
      toast({ variant: 'destructive', title: 'Weight looks off', description: 'Enter a number in your selected unit.' });
      return;
    }
    if (!Number.isFinite(heightNum) || heightNum <= 0 || heightNum > 250) {
      toast({ variant: 'destructive', title: 'Height looks off', description: 'Enter a number in your selected unit.' });
      return;
    }
    const next: WeightSetup = {
      ...setup,
      prePregKg: setup.unit === 'us' ? lbToKg(pre) : pre,
      heightCm: setup.unit === 'us' ? inToCm(heightNum) : heightNum,
    };
    persistSetup(next);
    setShowSetup(false);
    setDraftPre('');
    setDraftHeight('');
    toast({ title: 'Weight tracker ready', description: 'Log a weight when you weigh in next.' });
  };

  const handleLogToday = () => {
    const v = parseFloat(todayValue.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || v > 400) {
      toast({ variant: 'destructive', title: 'Weight looks off', description: 'Enter a number in your selected unit.' });
      return;
    }
    const kg = setup.unit === 'us' ? lbToKg(v) : v;
    const today = format(new Date(), 'yyyy-MM-dd');
    const next = [...entries.filter(e => e.date !== today), { date: today, kg }];
    persistEntries(next);
    setTodayValue('');
    toast({ title: 'Weight logged', description: `${fmtGain(kg - (setup.prePregKg ?? kg))} since pre-pregnancy.` });
  };

  const handleDeleteEntry = (date: string) => {
    persistEntries(entries.filter(e => e.date !== date));
  };

  if (!dueDate) return null;
  if (gestWeek === null) return null;

  // Setup-not-yet-done state. Compact intro card so the user knows
  // what to fill in.
  const isSetup = setup.prePregKg !== null && setup.heightCm !== null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Scale className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Weight gain</p>
          <p className="text-[11px] text-muted-foreground">
            {isSetup
              ? `BMI ${bmi?.toFixed(1)} (${IOM_RANGES[category!].label}) · IOM 2009 guidelines`
              : 'IOM 2009 gestational gain — set up to track'}
          </p>
        </div>
        {isSetup && (
          <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={() => setShowSetup(true)}>
            Edit setup
          </Button>
        )}
      </div>

      {!isSetup || showSetup ? (
        <div className="space-y-3 mb-2">
          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="space-y-1.5">
              <Label className="text-[11px]">Units</Label>
              <Select value={setup.unit} onValueChange={(v) => setSetup(s => ({ ...s, unit: v as Unit }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">kg / cm</SelectItem>
                  <SelectItem value="us">lb / in</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">
                Pre-pregnancy {setup.unit === 'us' ? '(lb)' : '(kg)'}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={draftPre}
                onChange={(e) => setDraftPre(e.target.value)}
                placeholder={setup.unit === 'us' ? 'e.g. 145' : 'e.g. 65'}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">
                Height {setup.unit === 'us' ? '(in)' : '(cm)'}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={draftHeight}
                onChange={(e) => setDraftHeight(e.target.value)}
                placeholder={setup.unit === 'us' ? 'e.g. 64' : 'e.g. 165'}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveSetup} disabled={!draftPre || !draftHeight}>
              Save
            </Button>
            {isSetup && (
              <Button size="sm" variant="outline" onClick={() => { setShowSetup(false); setDraftPre(''); setDraftHeight(''); }}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>Stored on this device for now. Gain ranges come from IOM 2009 based on your pre-pregnancy BMI.</span>
          </p>
        </div>
      ) : null}

      {isSetup && !showSetup && (
        <>
          {/* Quick log */}
          <div className="flex items-end gap-2 mb-3">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px]">Today's weight {setup.unit === 'us' ? '(lb)' : '(kg)'}</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={todayValue}
                onChange={(e) => setTodayValue(e.target.value)}
                placeholder={latest ? fmtWeight(latest.kg) : (setup.unit === 'us' ? 'e.g. 150' : 'e.g. 68')}
                className="h-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleLogToday} disabled={!todayValue}>
              Log
            </Button>
          </div>

          {/* Current vs expected band */}
          {actualGainKg !== null && expectedGain && (
            <div className="rounded-lg border p-3 mb-3 bg-muted/20">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] text-muted-foreground">Week {gestWeek} gain so far</span>
                {statusInfo && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{fmtGain(actualGainKg)}</span>
                <span className="text-[11px] text-muted-foreground">
                  expected {fmtGain(expectedGain.lowKg)} to {fmtGain(expectedGain.highKg)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {expectedGain.source}
              </p>
            </div>
          )}

          {/* Log entries */}
          {entries.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                History
              </p>
              <ul className="space-y-1">
                {[...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(e => (
                  <li key={e.date} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-20">{format(parseISO(e.date), 'MMM d, yyyy')}</span>
                    <span className="font-mono">{fmtWeight(e.kg)}</span>
                    <span className="text-muted-foreground">{setup.prePregKg ? fmtGain(e.kg - setup.prePregKg) + ' total' : ''}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(e.date)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      aria-label="Remove entry"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Reference: Institute of Medicine, Weight Gain During Pregnancy (2009). Individual targets can
        differ — your OB's recommendation is the one to follow.
      </p>
    </Card>
  );
}
