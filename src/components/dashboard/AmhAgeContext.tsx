import { Card } from '@/components/ui/card';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { hormoneKeyForTitle, parseLabValue } from '@/lib/hormone-reference';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { Egg, Info, TrendingDown, TrendingUp, Minus, MessageCircle } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// "Your AMH vs typical for your age" card. Anti-Müllerian Hormone is
// the cleanest single signal of ovarian reserve and it declines with
// age — so the same number means very different things at 25 vs 40.
//
// Renders only for conception / IVF modes where reserve is the most
// actionable. Hides itself entirely when:
//   - No AMH lab on file
//   - DOB unknown (without age the assessment is meaningless)
//   - Age outside the 10–100 sanity range
//
// Visual: a horizontal range bar showing p5 → median → p95 for the
// user's bracket with a pin at the user's value. Below: the brief
// note assessAmh() produced.

type Mode = 'conception' | 'ivf' | 'menstrual-cycle' | 'pre-menstrual' | 'contraception' | 'pregnancy' | 'postpartum' | 'menopause' | 'post-menopause';

interface AmhAgeContextProps {
  mode: Mode;
}

const SHOW_FOR: Mode[] = ['conception', 'ivf', 'menstrual-cycle'];

const BUCKET_COLOR: Record<string, string> = {
  very_low: 'bg-red-500',
  low: 'bg-amber-500',
  average: 'bg-green-500',
  high: 'bg-blue-500',
  very_high: 'bg-purple-500',
};

const BUCKET_LABEL: Record<string, string> = {
  very_low: 'Below 5th percentile',
  low: 'Below median',
  average: 'Near median',
  high: 'Above median',
  very_high: 'Above 95th percentile',
};

interface AmhHistoryPoint {
  value: number;
  date: string;
}

export default function AmhAgeContext({ mode }: AmhAgeContextProps) {
  const ctx = useUserHealthContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<AmhHistoryPoint[]>([]);

  // Pull every AMH reading over time so we can compute a trend
  // (annualized rate of change) alongside the current value. AMH
  // typically declines ~10–20%/yr — a steeper decline is worth
  // discussing with a fertility specialist.
  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('medical_extracted_data')
      .select('title, value, date_recorded')
      .eq('user_id', user.id)
      .eq('data_type', 'lab_result');
    const points: AmhHistoryPoint[] = [];
    for (const r of (data ?? []) as Array<{ title: string; value: string | null; date_recorded: string | null }>) {
      if (hormoneKeyForTitle(r.title) !== 'amh') continue;
      if (!r.date_recorded) continue;
      const v = parseLabValue(r.value);
      if (v === null) continue;
      points.push({ value: v, date: r.date_recorded });
    }
    points.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    setHistory(points);
  }, [user]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => onHealthDataChange(loadHistory), [loadHistory]);

  // Annualized change between the oldest and newest reading. Needs ≥2
  // readings spanning ≥90 days; otherwise the rate is too noisy to
  // report.
  const trend = useMemo(() => {
    if (history.length < 2) return null;
    const oldest = history[0];
    const newest = history[history.length - 1];
    const days = differenceInDays(new Date(newest.date), new Date(oldest.date));
    if (days < 90) return null;
    if (oldest.value <= 0) return null;
    const pctChange = ((newest.value - oldest.value) / oldest.value) * 100;
    const annualizedPct = pctChange * (365 / days);
    return { oldest, newest, days, pctChange, annualizedPct };
  }, [history]);

  // Pin position on the visual bar (0–100% of the p5..p95 range).
  // Clamped so out-of-band values still show at one of the edges.
  const pinPercent = useMemo(() => {
    if (!ctx.labs.amh || !ctx.amhAssessment) return null;
    const { p5, p95 } = ctx.amhAssessment;
    if (p95 <= p5) return null;
    const raw = (ctx.labs.amh.value - p5) / (p95 - p5);
    return Math.max(0, Math.min(1, raw)) * 100;
  }, [ctx.labs.amh, ctx.amhAssessment]);

  if (!SHOW_FOR.includes(mode)) return null;
  if (!ctx.loaded) return null;
  if (!ctx.labs.amh || !ctx.amhAssessment) return null;

  const a = ctx.amhAssessment;
  const lab = ctx.labs.amh;
  const dateLine = lab.dateRecorded
    ? `tested ${format(parseISO(lab.dateRecorded), 'MMM d, yyyy')}`
    : null;

  // Round display for the bracket band to one decimal — typical AMH
  // lab precision and matches what most reports show.
  const fmt = (n: number) => (n < 0.1 ? n.toFixed(2) : n.toFixed(1));

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Egg className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">AMH vs typical for your age</p>
          <p className="text-[11px] text-muted-foreground">
            Ovarian reserve marker • compared to ages {a.ageBracket}
          </p>
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold">{fmt(lab.value)}</span>
        <span className="text-xs text-muted-foreground">{lab.unit || 'ng/mL'}</span>
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full text-white ${BUCKET_COLOR[a.percentileBucket]}`}>
          {BUCKET_LABEL[a.percentileBucket]}
        </span>
      </div>

      {/* Visual bar: p5 — median — p95 range for the user's bracket. */}
      <div className="relative h-2 rounded-full bg-muted mb-1 overflow-visible">
        <div
          className="absolute inset-y-0 bg-gradient-to-r from-amber-400 via-green-400 to-blue-400 rounded-full"
          style={{ left: '0%', right: '0%' }}
        />
        {pinPercent !== null && (
          <div
            className="absolute -top-1.5 w-1 h-5 bg-foreground rounded-full"
            style={{ left: `calc(${pinPercent}% - 2px)` }}
            aria-label={`Your AMH: ${fmt(lab.value)} ${lab.unit || 'ng/mL'}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-3">
        <span>p5 {fmt(a.p5)}</span>
        <span>median {fmt(a.median)}</span>
        <span>p95 {fmt(a.p95)}</span>
      </div>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          {a.note}
          {dateLine && <span className="block mt-0.5 text-[10px] opacity-75">Your value {dateLine}.</span>}
        </span>
      </p>

      {/* Personal trend across logged AMH readings. AMH typically
          declines 10–20%/year; faster decline is worth raising with a
          fertility specialist. Only shown when there are ≥2 readings
          spanning ≥90 days. */}
      {trend && (
        <div className="mt-3 pt-3 border-t border-border/40 flex items-start gap-2">
          {trend.annualizedPct < -25 ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          ) : trend.annualizedPct < -5 ? (
            <TrendingDown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          ) : trend.annualizedPct > 25 ? (
            <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          )}
          <div className="text-[11px] text-muted-foreground flex-1">
            <p className="font-medium text-foreground/80">
              Your trend: {fmt(trend.oldest.value)} → {fmt(trend.newest.value)} ng/mL over {Math.round(trend.days / 30)} mo
            </p>
            <p>
              Annualized change: {trend.annualizedPct > 0 ? '+' : ''}{trend.annualizedPct.toFixed(0)}%/yr.
              {' '}
              {trend.annualizedPct < -25
                ? 'Faster decline than typical (10–20%/yr) — worth raising with a fertility specialist.'
                : trend.annualizedPct < -5
                  ? 'Within the typical 10–20%/yr decline range.'
                  : trend.annualizedPct > 25
                    ? 'AMH rose — unusual; could reflect new PCOS workup, supplementation, or lab variability.'
                    : 'Stable across your readings.'}
            </p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Reference: Seifer 2011 US cohort. AMH is one input among many — full reserve
        assessment also weighs FSH, antral follicle count, and age.
      </p>

      <div className="flex justify-end mt-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
          onClick={() => {
            const trendBit = trend
              ? ` (${trend.annualizedPct > 0 ? '+' : ''}${trend.annualizedPct.toFixed(0)}%/yr trend over ${Math.round(trend.days / 30)} months)`
              : '';
            const q = `My AMH is ${fmt(lab.value)} ${lab.unit || 'ng/mL'} at age ${ctx.age ?? '?'} — ${BUCKET_LABEL[a.percentileBucket].toLowerCase()} for the ${a.ageBracket} bracket${trendBit}. What does this mean for me and what would be worth discussing with my doctor?`;
            navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q)}`);
          }}
          aria-label="Ask AI about my AMH"
        >
          <MessageCircle className="h-3 w-3" />
          Ask Claude about this
        </button>
      </div>
    </Card>
  );
}
