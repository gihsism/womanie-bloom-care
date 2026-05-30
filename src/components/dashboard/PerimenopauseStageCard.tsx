import { Card } from '@/components/ui/card';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays, differenceInMonths, format, parseISO } from 'date-fns';
import { Flower2, Info, MessageCircle } from 'lucide-react';

// STRAW+10 staging estimator for menopausal-mode users.
//
// STRAW+10 (Stages of Reproductive Aging Workshop, 2012 revision) is
// the clinical standard for classifying where a woman is along the
// menopause transition. We can approximate the relevant stages from
// the data Womanie already has — last period date, cycle variability,
// recent FSH, age — and surface it as a small explanatory card.
//
// We deliberately limit ourselves to the stages that map cleanly to
// patient-tracked data. -5/-4 (peak reproductive) are not interesting
// to surface in menopause mode; +1b / +2 are time-based and we don't
// know the FMP date precisely.

type Stage =
  | '-3b' // late reproductive: regular cycles, possibly subtle changes
  | '-2'  // early transition: ≥7d SD variability in cycle length
  | '-1'  // late transition: ≥60d cycle gap
  | '+1a' // early postmenopause: 0–12mo since FMP (final menstrual period)
  | '+1b' // early postmenopause: 1–6yr since FMP
  | 'unknown';

const STAGE_DESCRIPTION: Record<Stage, { label: string; body: string }> = {
  '-3b': {
    label: 'Late reproductive (-3b)',
    body: 'Cycles are still regular. Some subtle changes (shorter follicular phase, AMH dropping) may be detectable in labs.',
  },
  '-2': {
    label: 'Early menopausal transition (-2)',
    body: 'Cycle length variability ≥ 7 days. Hormones fluctuate more; some skipped or shorter cycles are normal.',
  },
  '-1': {
    label: 'Late menopausal transition (-1)',
    body: 'At least one cycle gap of 60+ days. Estimated 1–3 years to final period. Symptoms (hot flashes, sleep, mood) often peak here.',
  },
  '+1a': {
    label: 'Early postmenopause (+1a)',
    body: 'Within 12 months of your last period. FSH stabilises high; vasomotor symptoms typically peak in this window.',
  },
  '+1b': {
    label: 'Early postmenopause (+1b)',
    body: '1–6 years past your last period. Symptoms gradually settle for most women; bone-density and cardiovascular monitoring become priorities.',
  },
  unknown: {
    label: 'Stage unclear',
    body: 'Log at least one period (even an estimated date) so we can stage it. Lab values like FSH help refine the estimate.',
  },
};

type Mode = 'menopause' | 'post-menopause' | string;

interface PerimenopauseStageCardProps {
  mode: Mode;
}

export default function PerimenopauseStageCard({ mode }: PerimenopauseStageCardProps) {
  const { user } = useAuth();
  const ctx = useUserHealthContext();
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

  // Stage classification. Order matters — match the most specific
  // signal first (postmenopausal FSH > 60d gap > variability > regular).
  const result = useMemo<{
    stage: Stage;
    rationale: string;
    monthsSinceLastPeriod: number | null;
  }>(() => {
    const sorted = [...periodRecords].sort(
      (a, b) => Date.parse(a.period_start_date) - Date.parse(b.period_start_date)
    );

    const lastPeriod = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    const monthsSince = lastPeriod
      ? differenceInMonths(new Date(), parseISO(lastPeriod.period_start_date))
      : null;

    // Postmenopausal FSH (>25 IU/L) is the cleanest signal of having
    // crossed the FMP. If we also see no period for 12+ months, +1a;
    // if 1–6 years, +1b.
    if (ctx.menopausalFsh && monthsSince !== null) {
      if (monthsSince >= 12 && monthsSince <= 72) {
        const stage: Stage = monthsSince <= 12 ? '+1a' : '+1b';
        return {
          stage,
          rationale: `FSH in menopausal range and last logged period ${monthsSince} months ago.`,
          monthsSinceLastPeriod: monthsSince,
        };
      }
      if (monthsSince >= 0 && monthsSince < 12) {
        return {
          stage: '+1a',
          rationale: `FSH in menopausal range and last logged period only ${monthsSince} months ago.`,
          monthsSinceLastPeriod: monthsSince,
        };
      }
    }

    // No-period-for-12-months rule (FMP confirmed retrospectively).
    if (monthsSince !== null && monthsSince >= 12) {
      const stage: Stage = monthsSince <= 72 ? '+1a' : '+1b';
      return {
        stage,
        rationale: `${monthsSince} months since your last logged period meets the 12-month definition of menopause.`,
        monthsSinceLastPeriod: monthsSince,
      };
    }

    // Need at least 3 cycle lengths to assess variability or detect a
    // 60+ day gap. Without enough data we can only fall back on age +
    // FSH hints.
    if (sorted.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const g = differenceInDays(parseISO(sorted[i].period_start_date), parseISO(sorted[i - 1].period_start_date));
        if (g > 0 && g < 200) gaps.push(g);
      }
      const maxGap = gaps.length ? Math.max(...gaps) : 0;
      if (maxGap >= 60) {
        return {
          stage: '-1',
          rationale: `Recent cycle gap of ${maxGap} days meets the 60-day threshold for late menopausal transition.`,
          monthsSinceLastPeriod: monthsSince,
        };
      }
      if (gaps.length >= 2) {
        const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
        const sd = Math.sqrt(gaps.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / gaps.length);
        if (sd >= 7) {
          return {
            stage: '-2',
            rationale: `Cycle length variability is ±${sd.toFixed(0)} days (≥7d threshold for early transition).`,
            monthsSinceLastPeriod: monthsSince,
          };
        }
      }
    }

    // Default — regular cycles plus the menopause-mode label means
    // late reproductive / very early transition.
    if (sorted.length > 0) {
      return {
        stage: '-3b',
        rationale: 'Cycles are still in the regular range. Hormone shifts may still be detectable in labs.',
        monthsSinceLastPeriod: monthsSince,
      };
    }
    return {
      stage: 'unknown',
      rationale: 'Add at least one period entry (or an estimated last-period date) to enable staging.',
      monthsSinceLastPeriod: monthsSince,
    };
  }, [periodRecords, ctx.menopausalFsh]);

  if (mode !== 'menopause' && mode !== 'post-menopause') return null;
  if (!loaded || !ctx.loaded) return null;

  const def = STAGE_DESCRIPTION[result.stage];

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Flower2 className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Where you are in the transition</p>
          <p className="text-[11px] text-muted-foreground">
            STRAW+10 staging from your tracked cycles{ctx.labs.fsh ? ' + FSH' : ''}
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
          {def.label}
        </span>
      </div>

      <p className="text-sm">{def.body}</p>

      <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          <span className="font-medium text-foreground/80">Why this stage:</span> {result.rationale}
          {result.monthsSinceLastPeriod !== null && (
            <span className="block mt-0.5">
              Last logged period: {format(parseISO(periodRecords[periodRecords.length - 1].period_start_date), 'MMM d, yyyy')}
              {' '}({result.monthsSinceLastPeriod} months ago)
            </span>
          )}
        </span>
      </p>

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Reference: STRAW+10 (2012 Workshop on the Stages of Reproductive Aging). Approximation
        from tracked data — not a clinical diagnosis. Discuss with your clinician.
      </p>

      {result.stage !== 'unknown' && (
        <div className="flex justify-end mt-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
            onClick={() => {
              const q = `My tracking suggests I'm at STRAW+10 stage ${result.stage} (${def.label}). ${result.rationale} What should I expect next and what's worth discussing with my doctor?`;
              navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q)}`);
            }}
            aria-label="Ask AI about my menopause stage"
          >
            <MessageCircle className="h-3 w-3" />
            Ask Claude about this
          </button>
        </div>
      )}
    </Card>
  );
}
