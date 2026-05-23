import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Scale, Plus, X, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

// Maternal weight-gain tracker. Uses IOM (Institute of Medicine /
// National Academies) guidelines, which are the standard in US
// prenatal care:
//   BMI <18.5     → 12.5–18 kg total gain
//   BMI 18.5–24.9 → 11.5–16 kg
//   BMI 25–29.9   →  7–11.5 kg
//   BMI ≥30       →  5–9 kg
//
// Gain typically distributes ~1–2 kg in trimester 1 and ~0.4 kg/week
// from then on, so we can plot an "expected by now" line against
// the user's logged points without needing any external data.
//
// Pre-pregnancy weight, height, and the weight log live in
// per-user localStorage. When the profiles schema gets these fields
// we can swap the localStorage path for an /api/db upsert without
// touching callers.

interface MaternalWeightTrackerProps {
  weeksPregnant: number;
}

interface WeightEntry {
  // ISO date (YYYY-MM-DD) of the measurement.
  date: string;
  // Weight in kg.
  kg: number;
}

interface StoredState {
  prePregnancyKg: number | null;
  heightCm: number | null;
  entries: WeightEntry[];
}

const KEY = (uid: string) => `womanie_maternal_weight_${uid}`;
const ZERO: StoredState = { prePregnancyKg: null, heightCm: null, entries: [] };

const BMI_CATEGORIES = [
  { max: 18.5, label: 'Underweight', range: [12.5, 18] as const, tone: 'text-blue-600' },
  { max: 25, label: 'Normal weight', range: [11.5, 16] as const, tone: 'text-emerald-600' },
  { max: 30, label: 'Overweight', range: [7, 11.5] as const, tone: 'text-amber-600' },
  { max: Infinity, label: 'Obese', range: [5, 9] as const, tone: 'text-orange-600' },
] as const;

function categoryForBmi(bmi: number) {
  return BMI_CATEGORIES.find(c => bmi < c.max) ?? BMI_CATEGORIES[BMI_CATEGORIES.length - 1];
}

// Rough expected gain at a given gestational week from a normal-BMI
// starting point. ~1.5 kg in T1, then 0.4 kg/week through 40.
function expectedGainKg(week: number, lowTotal: number, highTotal: number): { low: number; high: number } {
  // Scale linearly with how far through the typical-gain curve we are.
  // Below week 13 we're in T1 with a smaller share; above week 13 the
  // bulk of the gain happens.
  const t1Fraction = 1.5 / ((lowTotal + highTotal) / 2);
  const t1Cap = 13;
  if (week <= t1Cap) {
    const f = Math.max(0, week - 4) / (t1Cap - 4);
    return { low: lowTotal * t1Fraction * f * 0.8, high: highTotal * t1Fraction * f * 1.2 };
  }
  // After T1, remaining gain spread linearly across weeks 13-40.
  const remainingWeeks = Math.min(week, 40) - t1Cap;
  const remainingShare = remainingWeeks / (40 - t1Cap);
  const t1Low = lowTotal * t1Fraction * 0.8;
  const t1High = highTotal * t1Fraction * 1.2;
  return {
    low: t1Low + (lowTotal - t1Low) * remainingShare,
    high: t1High + (highTotal - t1High) * remainingShare,
  };
}

const MaternalWeightTracker = ({ weeksPregnant }: MaternalWeightTrackerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<StoredState>(ZERO);
  const [showSettings, setShowSettings] = useState(false);
  const [logInput, setLogInput] = useState('');
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!user) return;
    // Seed pre-pregnancy weight + height from the basic-info card
    // Settings stores under a separate key. The user can override here
    // (and likely should — pre-pregnancy weight isn't current weight).
    try {
      const raw = localStorage.getItem(KEY(user.id));
      if (raw) {
        const parsed = JSON.parse(raw) as StoredState;
        setState({
          prePregnancyKg: typeof parsed.prePregnancyKg === 'number' ? parsed.prePregnancyKg : null,
          heightCm: typeof parsed.heightCm === 'number' ? parsed.heightCm : null,
          entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        });
        return;
      }
      // Fall back to the basic-info card's stash for height — it's the
      // same number — but leave pre-pregnancy weight blank so the user
      // explicitly sets it (current weight ≠ pre-pregnancy weight).
      const basicRaw = localStorage.getItem(`womanie_basic_info_${user.id}`);
      if (basicRaw) {
        const basic = JSON.parse(basicRaw) as { heightCm?: number | null };
        setState({
          prePregnancyKg: null,
          heightCm: typeof basic.heightCm === 'number' ? basic.heightCm : null,
          entries: [],
        });
      }
    } catch {
      // Corrupt JSON — leave blank.
    }
  }, [user?.id]);

  const persist = (next: StoredState) => {
    setState(next);
    if (!user) return;
    try {
      localStorage.setItem(KEY(user.id), JSON.stringify(next));
    } catch {
      // Quota / private mode — accept in-memory state.
    }
  };

  const bmi = useMemo(() => {
    if (!state.prePregnancyKg || !state.heightCm) return null;
    const m = state.heightCm / 100;
    return state.prePregnancyKg / (m * m);
  }, [state.prePregnancyKg, state.heightCm]);

  const category = bmi !== null ? categoryForBmi(bmi) : null;

  const sortedEntries = useMemo(
    () => [...state.entries].sort((a, b) => a.date.localeCompare(b.date)),
    [state.entries]
  );

  const latest = sortedEntries[sortedEntries.length - 1];
  const currentGainKg = latest && state.prePregnancyKg
    ? latest.kg - state.prePregnancyKg
    : null;

  const expectedNow = category
    ? expectedGainKg(weeksPregnant, category.range[0], category.range[1])
    : null;

  const onTrack = currentGainKg !== null && expectedNow
    ? currentGainKg >= expectedNow.low - 1 && currentGainKg <= expectedNow.high + 1
    : null;

  const setPrePregnancyWeight = (val: string) => {
    const n = parseFloat(val);
    persist({ ...state, prePregnancyKg: Number.isFinite(n) && n > 0 ? n : null });
  };
  const setHeight = (val: string) => {
    const n = parseFloat(val);
    persist({ ...state, heightCm: Number.isFinite(n) && n > 0 ? n : null });
  };

  const addEntry = () => {
    const n = parseFloat(logInput);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ variant: 'destructive', title: 'Enter a weight in kg' });
      return;
    }
    // One entry per date — replace if the user logs again the same day.
    const filtered = state.entries.filter(e => e.date !== logDate);
    const next: StoredState = {
      ...state,
      entries: [...filtered, { date: logDate, kg: n }],
    };
    persist(next);
    setLogInput('');
    setLogDate(format(new Date(), 'yyyy-MM-dd'));
    toast({ title: 'Weight logged', description: `${n.toFixed(1)} kg on ${logDate}.` });
  };

  const removeEntry = (date: string) => {
    persist({ ...state, entries: state.entries.filter(e => e.date !== date) });
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          Your weight
        </h4>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowSettings(s => !s)}>
          {showSettings ? 'Done' : 'Settings'}
        </Button>
      </div>

      {showSettings && (
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30">
          <div className="space-y-1">
            <Label htmlFor="pre-preg-weight" className="text-xs">Pre-pregnancy weight (kg)</Label>
            <Input
              id="pre-preg-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={state.prePregnancyKg ?? ''}
              onChange={(e) => setPrePregnancyWeight(e.target.value)}
              placeholder="e.g. 62"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="height-cm" className="text-xs">Height (cm)</Label>
            <Input
              id="height-cm"
              type="number"
              inputMode="numeric"
              value={state.heightCm ?? ''}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="e.g. 165"
              className="h-9"
            />
          </div>
          <p className="col-span-2 text-[11px] text-muted-foreground">
            Stored on this device. Used to compute your pre-pregnancy BMI and recommended
            total gain — both per IOM (Institute of Medicine) guidelines.
          </p>
        </div>
      )}

      {/* Headline stats */}
      {state.prePregnancyKg === null ? (
        <div className="text-center py-6 space-y-2">
          <p className="text-sm text-muted-foreground">
            Add your pre-pregnancy weight to start tracking gain.
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            Set up
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-muted/50 rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Pre-pregnancy</div>
              <div className="text-sm font-semibold">{state.prePregnancyKg.toFixed(1)} kg</div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <div className="text-xs text-muted-foreground">Current</div>
              <div className="text-sm font-semibold">
                {latest ? `${latest.kg.toFixed(1)} kg` : '—'}
              </div>
            </div>
            <div className={`rounded-xl p-3 ${
              onTrack === false ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-muted/50'
            }`}>
              <div className="text-xs text-muted-foreground">Gain</div>
              <div className="text-sm font-semibold">
                {currentGainKg !== null
                  ? `${currentGainKg > 0 ? '+' : ''}${currentGainKg.toFixed(1)} kg`
                  : '—'}
              </div>
              {onTrack !== null && (
                <div className={`text-[10px] mt-0.5 ${
                  onTrack ? 'text-green-600' : 'text-amber-600'
                }`}>
                  {onTrack ? 'on track' : 'outside range'}
                </div>
              )}
            </div>
          </div>

          {category && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="flex items-center justify-between">
                <span>Pre-pregnancy BMI</span>
                <span className={`font-medium ${category.tone}`}>
                  {bmi?.toFixed(1)} · {category.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Recommended total gain (IOM)</span>
                <span className="font-medium">{category.range[0]}–{category.range[1]} kg</span>
              </div>
              {expectedNow && (
                <div className="flex items-center justify-between">
                  <span>Expected by week {weeksPregnant}</span>
                  <span className="font-medium">{expectedNow.low.toFixed(1)}–{expectedNow.high.toFixed(1)} kg</span>
                </div>
              )}
            </div>
          )}

          {/* Log a new measurement */}
          <div className="flex items-end gap-2 p-3 rounded-lg bg-muted/30">
            <div className="space-y-1 flex-1">
              <Label htmlFor="log-date" className="text-xs">Date</Label>
              <Input
                id="log-date"
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="h-9"
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label htmlFor="log-weight" className="text-xs">Weight (kg)</Label>
              <Input
                id="log-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={logInput}
                onChange={(e) => setLogInput(e.target.value)}
                placeholder="e.g. 68.5"
                className="h-9"
              />
            </div>
            <Button onClick={addEntry} size="sm" className="gap-1 h-9">
              <Plus className="h-3.5 w-3.5" />
              Log
            </Button>
          </div>

          {/* Entries list */}
          {sortedEntries.length > 0 && (
            <div className="space-y-1 pt-1">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Recent log
              </h5>
              <ul className="space-y-1">
                {[...sortedEntries].reverse().slice(0, 8).map(e => {
                  const gain = state.prePregnancyKg
                    ? e.kg - state.prePregnancyKg
                    : null;
                  return (
                    <li key={e.date} className="flex items-center justify-between text-xs gap-2 py-1 border-b last:border-0">
                      <span className="text-muted-foreground">{e.date}</span>
                      <span className="font-medium flex items-center gap-2">
                        {e.kg.toFixed(1)} kg
                        {gain !== null && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                            {gain > 0 ? '+' : ''}{gain.toFixed(1)} kg
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => removeEntry(e.date)}
                          className="text-muted-foreground/60 hover:text-destructive"
                          aria-label={`Remove entry for ${e.date}`}
                          title="Remove this entry"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export default MaternalWeightTracker;
