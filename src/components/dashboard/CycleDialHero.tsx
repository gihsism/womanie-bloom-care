import { WEEKDAY_DAY_MONTH_FMT } from '@/lib/dateFormat';
import { differenceInDays, format } from 'date-fns';
import { cycleDial } from '@/lib/bodyMap';
import { useCycleModel } from '@/hooks/useCycleModel';
import { DetailsLink } from '@/components/dashboard/HomeBlocks';
import { periodDaysUntil } from '@/hooks/useTodaySignals';
import { MAX_LATE_DAYS } from '@/lib/todayItems';

// Version 8 hero for period tracking and trying to conceive: the cycle
// as a dial. The ring is one cycle, starting at the top; a thick ink
// arc is the period, a cobalt arc the fertile window, a dashed arc the
// days before the next period; the cobalt marker is today. Home keeps it
// to one fact ("Day 18 of 28"), one sentence and one Details link; the
// calendar, ovulation detail and logging live one tap away.

const CX = 160;
const CY = 140;
const R = 108;

const point = (t: number, r = R) => {
  const a = t * 2 * Math.PI - Math.PI / 2;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
};
const arc = (t0: number, t1: number, r = R) => {
  const p0 = point(t0, r); const p1 = point(t1, r);
  const large = t1 - t0 > 0.5 ? 1 : 0;
  return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} A${r},${r} 0 ${large} 1 ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
};

const PHASE_TEXT: Record<string, { name: string; note: string }> = {
  period: { name: 'Period', note: 'Rest if you need it; iron-rich food helps.' },
  follicular: { name: 'First half of your cycle', note: 'Energy usually rises this week.' },
  fertile: { name: 'Fertile window', note: 'The days a pregnancy is most likely.' },
  luteal: { name: 'Second half of your cycle', note: 'Progesterone is up; sleep may feel heavier.' },
  pms: { name: 'Before your period', note: 'PMS days for many — be gentle with yourself.' },
};

export default function CycleDialHero({
  lastPeriodStart, cycleLength, mode,
}: { lastPeriodStart: Date; cycleLength: number; name?: string | null; mode: string }) {
  const now = new Date();
  // Full personal prediction (her logged periods, LH / temperature /
  // discharge signs, labs). Falls back to the stored length until loaded.
  const { prediction: p, loaded, periodRecords } = useCycleModel();
  const usable = loaded && periodRecords.length > 0;
  const start = usable ? new Date(`${periodRecords[0].period_start_date}T00:00:00`) : lastPeriodStart;
  const predictedLen = usable ? differenceInDays(p.predictedPeriodStart, start) : 0;
  const len = usable && predictedLen >= 15 && predictedLen <= 60 ? predictedLen : (usable ? p.averageCycleLength : cycleLength);
  const ovuDay = usable && predictedLen >= 15 && predictedLen <= 60 ? differenceInDays(p.predictedOvulationDate, start) + 1 : undefined;
  // A late period (same rule and numbers as Home's "Period N days late?"
  // row): the prediction has already rolled on to the NEXT cycle ("Day 30
  // of 56, next period in 27 days") and the stored length would wrap round
  // to day 2. Instead the dial stops on its last day and says she is late.
  const pd = periodDaysUntil({ lastPeriodStart, cycleLength }, now);
  const lateBy = pd != null && pd < 0 && pd >= -MAX_LATE_DAYS ? -pd : 0;
  const late = lateBy > 0;
  const dialLen = late ? cycleLength : len;
  const dialNow = late ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - lateBy - 1) : now;
  const d = cycleDial(late ? lastPeriodStart : start, dialLen, dialNow, usable ? Math.min(p.averagePeriodLength, 8) : 5, late ? undefined : ovuDay);
  const L = d.length;
  const t = (day: number) => (day - 1) / L; // start of a day on the ring
  const today = point((d.day - 0.5) / L);
  const ovu = point((d.ovulationDay - 0.5) / L, R + 12);
  const ttc = mode === 'conception';
  const phase = PHASE_TEXT[d.phase];

  const inDays = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  const toFertileEnd = d.fertileEnd - d.day;
  const sentence = late
    ? `Period ${lateBy} day${lateBy === 1 ? '' : 's'} late? Log it if it started.`
    : ttc && d.daysToFertile === 0
    ? `Your fertile window ends ${inDays(toFertileEnd)}.`
    : ttc && d.daysToFertile != null
      ? `Your fertile window starts ${inDays(d.daysToFertile)}.`
      : `Next period ${inDays(d.daysToPeriod)}, around ${format(d.nextPeriod, WEEKDAY_DAY_MONTH_FMT)}.`;

  return (
    <section className="mb-6" aria-label="Your cycle at a glance">
      <p className="label-mono">{format(now, WEEKDAY_DAY_MONTH_FMT)}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        Day {late ? L + lateBy + 1 : d.day} {!late && <span className="text-muted-foreground">of {L}</span>}
      </h2>
      <p className="mt-1 text-[15px]">{sentence}</p>

      <div className="relative mx-auto mt-2 w-full max-w-[240px]" style={{ aspectRatio: '320 / 285' }}>
        <svg viewBox="0 0 320 285" className="absolute inset-0 h-full w-full" role="img"
          aria-label={late ? `Cycle day ${L + lateBy + 1}. ${sentence}` : `Cycle day ${d.day} of ${L}. ${phase.name}. Next period in ${d.daysToPeriod} days.`}>
          <defs>
            <radialGradient id="cd-glow" cx=".5" cy=".5" r=".55">
              <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity=".13" />
              <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={CX} cy={CY} r={R + 18} fill="url(#cd-glow)" />
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
          {Array.from({ length: L }, (_, i) => {
            const a = point(i / L, R - 4); const b = point(i / L, R + (i % 7 === 0 ? 5 : 2));
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="hsl(var(--muted-foreground) / .5)" strokeWidth=".7" />;
          })}
          {/* period, fertile window, pms */}
          <path d={arc(t(1), t(d.periodDays + 1))} fill="none" stroke="hsl(var(--foreground))" strokeWidth="5" strokeLinecap="round" />
          <path d={arc(t(d.fertileStart), t(d.fertileEnd + 1))} fill="none" stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round" opacity={ttc ? 1 : 0.75} />
          <path d={arc(t(L - 4), t(L + 1) - 0.004)} fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.2" strokeDasharray="2 4" />
          <circle cx={ovu.x} cy={ovu.y} r="2.6" fill="hsl(var(--primary))" />
          {/* today */}
          <circle cx={today.x} cy={today.y} r="6" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="2" />
          <circle cx={today.x} cy={today.y} r="13" fill="none" stroke="hsl(var(--primary))" strokeWidth=".9" />
          <circle cx={today.x} cy={today.y} r="20" fill="none" stroke="hsl(var(--primary))" strokeWidth=".6" opacity=".45" />
          {/* centre: the phase in plain words (the day number is in the heading) */}
          <foreignObject x={CX - 70} y={CY - 30} width="140" height="60">
            <p className="h-full flex items-center justify-center text-center text-[13px] leading-snug text-muted-foreground">{late ? 'Period expected' : phase.name}</p>
          </foreignObject>
        </svg>
      </div>

      <DetailsLink to="/dashboard/stage#cycle-calendar" />
    </section>
  );
}
