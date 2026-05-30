import { Card } from '@/components/ui/card';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, parseISO } from 'date-fns';
import { Heart, Info, MessageCircle } from 'lucide-react';

// Fertility-outlook synthesis for conception mode.
//
// The AmhAgeContext card answers "how's my reserve?" and the
// CyclePredictionInsights card explains "why is the prediction
// uncertain?" — but a patient trying to conceive wants the next
// layer up: "given my age + AMH + cycle regularity, what's a
// sensible time horizon to think about?"
//
// We don't try to predict probability of conception (high-variance,
// requires intercourse timing data, and not appropriate to fake).
// What we *can* do: pull the three signals together, give them
// each a colour (green / amber / red), and produce a short
// narrative that names the picture without overpromising.
//
// Hidden unless mode is 'conception'. Hidden if we have neither
// age nor AMH nor cycle data — there's nothing to synthesize.

type Mode = string;
type SignalColor = 'green' | 'amber' | 'red' | 'muted';

interface FertilityOutlookCardProps {
  mode: Mode;
}

interface Signal {
  label: string;
  value: string;
  color: SignalColor;
  detail?: string;
}

const COLOR_BG: Record<SignalColor, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  muted: 'bg-muted text-muted-foreground',
};

export default function FertilityOutlookCard({ mode }: FertilityOutlookCardProps) {
  const ctx = useUserHealthContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periodRecords, setPeriodRecords] = useState<Array<{
    period_start_date: string;
    cycle_length: number;
  }>>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('period_tracking')
      .select('period_start_date, cycle_length')
      .eq('user_id', user.id)
      .order('period_start_date', { ascending: true });
    setPeriodRecords((data ?? []) as Array<{ period_start_date: string; cycle_length: number }>);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  // Compute the three signals.
  const signals = useMemo<Signal[] | null>(() => {
    if (!ctx.loaded) return null;
    const out: Signal[] = [];

    // 1. Age. Population fertility numbers from ACOG/ASRM. We don't
    // assign probabilities — just color the bracket.
    if (ctx.age !== null) {
      let color: SignalColor;
      let detail: string;
      if (ctx.age < 30) { color = 'green'; detail = 'Peak fertility window.'; }
      else if (ctx.age < 35) { color = 'green'; detail = 'Still in the peak window; minimal age-related decline.'; }
      else if (ctx.age < 38) { color = 'amber'; detail = 'Mid-30s — fecundity begins to decline gradually.'; }
      else if (ctx.age < 41) { color = 'amber'; detail = 'Decline accelerates from 38 onward.'; }
      else if (ctx.age < 43) { color = 'red'; detail = 'Marked decline; consider fertility evaluation if not already.'; }
      else { color = 'red'; detail = 'Natural conception possible but increasingly uncommon; specialist consult advisable.'; }
      out.push({ label: 'Age', value: `${ctx.age}`, color, detail });
    } else {
      out.push({ label: 'Age', value: 'unknown', color: 'muted', detail: 'Add your date of birth in Settings → Personal info.' });
    }

    // 2. AMH (ovarian reserve). Uses the same assessment from the
    // hormone-reference library so colors match the AmhAgeContext card.
    if (ctx.amhAssessment) {
      const label = ctx.amhAssessment.reserveLabel;
      let color: SignalColor;
      if (label === 'diminished') color = 'red';
      else if (label === 'low_average') color = 'amber';
      else if (label === 'high') color = 'green';
      else color = 'green';
      out.push({
        label: 'AMH (reserve)',
        value: label.replace(/_/g, ' '),
        color,
        detail: ctx.amhAssessment.note,
      });
    } else {
      out.push({
        label: 'AMH (reserve)',
        value: 'no data',
        color: 'muted',
        detail: 'Upload a recent AMH lab to anchor your reserve estimate.',
      });
    }

    // 3. Cycle regularity. Use the period_tracking SD if we have
    // enough cycles; otherwise label "needs more data."
    if (periodRecords.length >= 3) {
      const sorted = [...periodRecords].sort(
        (a, b) => Date.parse(a.period_start_date) - Date.parse(b.period_start_date)
      );
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const g = differenceInDays(parseISO(sorted[i].period_start_date), parseISO(sorted[i - 1].period_start_date));
        if (g >= 18 && g <= 60) gaps.push(g);
      }
      if (gaps.length >= 2) {
        const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
        const sd = Math.sqrt(gaps.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / gaps.length);
        let color: SignalColor;
        let detail: string;
        if (sd < 3) { color = 'green'; detail = `Very regular (±${sd.toFixed(1)}d); ovulation is likely predictable.`; }
        else if (sd < 7) { color = 'amber'; detail = `Some variability (±${sd.toFixed(1)}d); fertile window may shift cycle to cycle.`; }
        else { color = 'red'; detail = `High variability (±${sd.toFixed(1)}d); discuss with a clinician if trying to conceive.`; }
        out.push({ label: 'Cycle regularity', value: `±${sd.toFixed(0)}d`, color, detail });
      } else {
        out.push({ label: 'Cycle regularity', value: 'unclear', color: 'muted', detail: 'Logged cycles look unusual — review the cycle history.' });
      }
    } else {
      out.push({
        label: 'Cycle regularity',
        value: 'need more data',
        color: 'muted',
        detail: `Log at least 3 cycles for a regularity estimate (you have ${periodRecords.length}).`,
      });
    }

    return out;
  }, [ctx, periodRecords]);

  // Hide if conception isn't the active mode, the synthesis hasn't
  // loaded, or we have literally zero of the three signals.
  if (mode !== 'conception') return null;
  if (!loaded || !ctx.loaded || !signals) return null;
  if (signals.every(s => s.color === 'muted')) return null;

  // One-line narrative summary based on the worst non-muted signal.
  const worst = signals.find(s => s.color === 'red')
    ?? signals.find(s => s.color === 'amber')
    ?? signals.find(s => s.color === 'green');

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Heart className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Fertility outlook</p>
          <p className="text-[11px] text-muted-foreground">
            Age + ovarian reserve + cycle regularity, side by side
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        {signals.map(s => (
          <div key={s.label} className="p-2.5 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${COLOR_BG[s.color]}`}>
                {s.value}
              </span>
            </div>
            {s.detail && <p className="text-[11px] text-muted-foreground leading-snug">{s.detail}</p>}
          </div>
        ))}
      </div>

      {worst && worst.color !== 'muted' && (
        <p className="text-xs flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground/80">Bottom line:</span>{' '}
            {worst.color === 'red'
              ? 'At least one signal flags a meaningful concern — consider a fertility consult to discuss next steps.'
              : worst.color === 'amber'
                ? 'Picture is mostly favourable with one signal to keep an eye on. Tracking the next few cycles will sharpen the read.'
                : 'All three signals look favourable. Keep logging cycles + retest AMH yearly to watch for changes.'}
          </span>
        </p>
      )}

      <div className="flex justify-end mt-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
          onClick={() => {
            const parts: string[] = [];
            if (ctx.age !== null) parts.push(`I'm ${ctx.age}`);
            if (ctx.amhAssessment) {
              parts.push(`my AMH reads ${ctx.amhAssessment.reserveLabel.replace(/_/g, ' ')} for my age`);
            }
            const cycleSignal = signals.find(s => s.label === 'Cycle regularity');
            if (cycleSignal && cycleSignal.color !== 'muted') {
              parts.push(`my cycle regularity is ${cycleSignal.value}`);
            }
            const desc = parts.length > 0 ? parts.join(', ') : 'my current data';
            const q = `Given ${desc}, what would you suggest I think about as I try to conceive?`;
            navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q)}`);
          }}
          aria-label="Ask AI about my fertility outlook"
        >
          <MessageCircle className="h-3 w-3" />
          Ask Claude about this
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Not a probability estimate. Real fertility evaluation also weighs intercourse timing, antral follicle count,
        partner factors, and prior conception history. Discuss with a fertility specialist for a complete picture.
      </p>
    </Card>
  );
}
