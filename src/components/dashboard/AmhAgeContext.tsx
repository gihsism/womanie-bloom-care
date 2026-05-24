import { Card } from '@/components/ui/card';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { AMH_BY_AGE } from '@/lib/hormone-reference';
import { Egg, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';

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

type Mode = 'conception' | 'ivf' | 'menstrual-cycle' | 'pre-menstrual' | 'contraception' | 'pregnancy' | 'menopause' | 'post-menopause';

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

export default function AmhAgeContext({ mode }: AmhAgeContextProps) {
  const ctx = useUserHealthContext();

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

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Reference: Seifer 2011 US cohort. AMH is one input among many — full reserve
        assessment also weighs FSH, antral follicle count, and age.
      </p>
    </Card>
  );
}
