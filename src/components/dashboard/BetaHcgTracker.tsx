import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Droplet, Plus, X, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, parseISO, differenceInHours } from 'date-fns';

// Beta hCG tracker for IVF mode. After embryo transfer the clinic
// draws a beta hCG blood test ~9-14 days later, then repeats it every
// 48 hours. In a healthy pregnancy hCG roughly doubles every 48-72
// hours through ~6 weeks gestation. A flat or slow-rising curve is a
// red flag the patient's clinic will want to monitor closely.
//
// All state lives in per-user localStorage. When the schema gets an
// `ivf_lab_results` table this can swap the storage path for an
// /api/db upsert without changing callers.

interface BetaHcgTrackerProps {
  // The TWW / Beta phases are when this is most relevant, but we don't
  // hide the card outside them — patients may log retrospectively.
  ivfPhase?: string | null;
}

interface BetaDraw {
  // YYYY-MM-DD
  date: string;
  // HH:MM (24h), optional. When omitted we use noon for the math.
  time: string | null;
  // hCG value in mIU/mL.
  value: number;
}

const KEY = (uid: string) => `womanie_beta_hcg_${uid}`;

function toIsoMinute(date: string, time: string | null): string {
  return `${date}T${(time || '12:00')}:00`;
}

const BetaHcgTracker = ({ ivfPhase }: BetaHcgTrackerProps) => {
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [draws, setDraws] = useState<BetaDraw[]>([]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(KEY(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as BetaDraw[];
        if (Array.isArray(parsed)) setDraws(parsed);
      }
    } catch {
      // Corrupt JSON — start empty.
    }
  }, [userId]);

  const persist = (next: BetaDraw[]) => {
    setDraws(next);
    if (!userId) return;
    try {
      localStorage.setItem(KEY(userId), JSON.stringify(next));
    } catch {
      // Quota / private mode — accept in-memory state.
    }
  };

  const sorted = useMemo(
    () =>
      [...draws].sort((a, b) =>
        toIsoMinute(a.date, a.time).localeCompare(toIsoMinute(b.date, b.time))
      ),
    [draws]
  );

  // Compute doubling time between consecutive draws. Healthy early
  // pregnancy is 48–72 hours; substantially slower (>96h) is a
  // clinical red flag the user's RE will want to follow up on.
  const pairs = useMemo(() => {
    const out: Array<{
      from: BetaDraw;
      to: BetaDraw;
      hours: number;
      ratio: number;
      doublingTimeHours: number | null;
    }> = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const hours = differenceInHours(
        parseISO(toIsoMinute(curr.date, curr.time)),
        parseISO(toIsoMinute(prev.date, prev.time))
      );
      const ratio = curr.value / Math.max(prev.value, 1);
      const doublingTimeHours =
        ratio > 1 ? (hours * Math.LN2) / Math.log(ratio) : null;
      out.push({ from: prev, to: curr, hours, ratio, doublingTimeHours });
    }
    return out;
  }, [sorted]);

  const latest = sorted[sorted.length - 1] ?? null;
  const trend = pairs[pairs.length - 1] ?? null;

  const interpretLatest = (): { tone: 'positive' | 'caution' | 'flat' | null; label: string; detail: string } | null => {
    if (!latest) return null;
    if (latest.value < 5) {
      return {
        tone: 'flat',
        label: 'Negative',
        detail: 'hCG below 5 mIU/mL is not detectable as pregnancy. Talk to your clinic about next steps.',
      };
    }
    if (latest.value < 25 && !trend) {
      return {
        tone: 'caution',
        label: 'Borderline',
        detail: 'Single low-positive draw. A repeat in 48 hours is the standard follow-up.',
      };
    }
    if (trend?.doublingTimeHours !== null && trend?.doublingTimeHours !== undefined) {
      if (trend.doublingTimeHours <= 72) {
        return {
          tone: 'positive',
          label: 'Doubling normally',
          detail: `hCG is doubling roughly every ${trend.doublingTimeHours.toFixed(0)} hours — within the typical 48-72h window.`,
        };
      }
      if (trend.doublingTimeHours <= 96) {
        return {
          tone: 'caution',
          label: 'Slower than typical',
          detail: `Doubling about every ${trend.doublingTimeHours.toFixed(0)} hours. Slower than the 48-72h reassurance window but still rising — your clinic will want to keep monitoring.`,
        };
      }
      if (trend.ratio < 1) {
        return {
          tone: 'flat',
          label: 'Falling',
          detail: `hCG dropped from ${trend.from.value} to ${trend.to.value} mIU/mL. Contact your clinic — this can indicate an early loss.`,
        };
      }
      return {
        tone: 'flat',
        label: 'Plateau / slow rise',
        detail: `Doubling time around ${trend.doublingTimeHours.toFixed(0)} hours — well outside the 48-72h reassurance window. Your clinic should review urgently.`,
      };
    }
    return {
      tone: 'positive',
      label: 'Positive — single draw',
      detail: 'Wait for the repeat draw to assess the doubling trend.',
    };
  };

  const interpretation = interpretLatest();

  const addDraw = () => {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num < 0) {
      toast({ variant: 'destructive', title: 'Enter a value in mIU/mL' });
      return;
    }
    if (num > 200_000) {
      toast({ variant: 'destructive', title: 'Value out of range', description: 'hCG above 200,000 mIU/mL is unusual — double-check the number.' });
      return;
    }
    const next: BetaDraw[] = [
      ...draws.filter(d => !(d.date === date && (d.time || '') === (time || ''))),
      { date, time: time || null, value: num },
    ];
    persist(next);
    setValue('');
    toast({ title: 'Beta hCG logged', description: `${num} mIU/mL on ${date}${time ? ` at ${time}` : ''}.` });
  };

  const remove = (d: BetaDraw) => {
    persist(draws.filter(x => !(x.date === d.date && (x.time || null) === (d.time || null))));
  };

  // Phase-aware tone: highlight the card when the user is in TWW or
  // beta phase, since this is exactly when they need it.
  const highlight = ivfPhase === 'tww' || ivfPhase === 'beta';

  return (
    <Card className={`p-4 space-y-3 ${highlight ? 'border-primary/30 bg-primary/5' : ''}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Droplet className="h-4 w-4 text-primary" />
          Beta hCG tracker
        </h4>
        <Badge variant="outline" className="text-[10px]">
          Doubles every 48-72h normally
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Log each blood draw your clinic does after transfer. We'll calculate the doubling time
        and flag values outside the typical range — it's not medical advice, just a sanity check.
      </p>

      {/* Add new draw */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end p-3 rounded-lg bg-muted/30">
        <div className="space-y-1">
          <Label htmlFor="beta-date" className="text-xs">Draw date</Label>
          <Input
            id="beta-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="beta-time" className="text-xs">Time (optional)</Label>
          <Input
            id="beta-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="beta-value" className="text-xs">hCG (mIU/mL)</Label>
          <Input
            id="beta-value"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 187"
            className="h-9"
          />
        </div>
        <Button onClick={addDraw} className="h-9 gap-1">
          <Plus className="h-3.5 w-3.5" />
          Log
        </Button>
      </div>

      {/* Interpretation */}
      {interpretation && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg border ${
            interpretation.tone === 'positive'
              ? 'border-green-300/60 bg-green-50/60 dark:bg-green-900/20 dark:border-green-700/40'
              : interpretation.tone === 'caution'
              ? 'border-amber-300/60 bg-amber-50/60 dark:bg-amber-900/20 dark:border-amber-700/40'
              : 'border-destructive/30 bg-destructive/5'
          }`}
        >
          {interpretation.tone === 'positive' ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
          ) : interpretation.tone === 'caution' ? (
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
          )}
          <div className="text-sm flex-1 min-w-0">
            <p className="font-medium">{interpretation.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{interpretation.detail}</p>
          </div>
        </div>
      )}

      {/* Draws list with doubling between */}
      {sorted.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            Draws ({sorted.length})
          </h5>
          <div className="space-y-1.5">
            {sorted.map((d, i) => {
              const pair = i > 0 ? pairs[i - 1] : null;
              return (
                <div key={`${d.date}-${d.time}`} className="space-y-1">
                  {pair && (
                    <div className="text-[10px] text-muted-foreground pl-3 border-l-2 border-muted ml-1.5">
                      ↑ {pair.ratio.toFixed(2)}× in {pair.hours}h
                      {pair.doublingTimeHours !== null && (
                        <> · doubling ~{pair.doublingTimeHours.toFixed(0)}h</>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/30">
                    <span className="text-muted-foreground">
                      {d.date}{d.time ? ` · ${d.time}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{d.value.toLocaleString()} mIU/mL</span>
                      <button
                        type="button"
                        onClick={() => remove(d)}
                        className="text-muted-foreground/60 hover:text-destructive"
                        aria-label="Remove this draw"
                        title="Remove this draw"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sorted.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">
          Your first beta is usually ~9–14 days after transfer. Log it here and we'll plot the
          doubling.
        </p>
      )}
    </Card>
  );
};

export default BetaHcgTracker;
