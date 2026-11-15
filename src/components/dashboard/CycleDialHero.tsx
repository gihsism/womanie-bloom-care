import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cycleDial, weekWord } from '@/lib/bodyMap';

// Version 8 hero for period tracking and trying to conceive: the cycle
// as a dial. The ring is one cycle, starting at the top; a thick ink
// arc is the period, a cobalt arc the fertile window, a dashed arc the
// days before the next period; the cobalt marker is today. Four museum
// labels underneath open the calendar or today's log.

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
  follicular: { name: 'Follicular', note: 'Energy usually rises this week.' },
  fertile: { name: 'Fertile window', note: 'The days a pregnancy is most likely.' },
  luteal: { name: 'Luteal', note: 'Progesterone is up; sleep may feel heavier.' },
  pms: { name: 'Before your period', note: 'PMS days for many — be gentle with yourself.' },
};

export default function CycleDialHero({
  lastPeriodStart, cycleLength, name, mode,
}: { lastPeriodStart: Date; cycleLength: number; name?: string | null; mode: string }) {
  const navigate = useNavigate();
  const now = new Date();
  const d = cycleDial(lastPeriodStart, cycleLength, now);
  const L = d.length;
  const t = (day: number) => (day - 1) / L; // start of a day on the ring
  const today = point((d.day - 0.5) / L);
  const ovu = point((d.ovulationDay - 0.5) / L, R + 12);
  const first = name?.trim().split(/\s+/)[0];
  const ttc = mode === 'conception';
  const phase = PHASE_TEXT[d.phase];

  const go = (target: string) => {
    if (target.startsWith('/')) { navigate(target); return; }
    const el = document.getElementById(target.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/40', 'rounded-xl');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40', 'rounded-xl'), 1600);
    }
  };

  const fertileLine = d.daysToFertile === 0
    ? (ttc ? 'Best days are now' : 'Now')
    : d.daysToFertile != null
      ? `Starts in ${d.daysToFertile} day${d.daysToFertile === 1 ? '' : 's'}`
      : 'Passed this cycle';

  return (
    <section className="mb-6" aria-label="Your cycle at a glance">
      <p className="label-mono">{first ? `${first} · ` : ''}{format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        Day {weekWord(d.day)}<br /><span className="text-muted-foreground">of {weekWord(L)}</span>
      </h2>

      <div className="relative mx-auto mt-2 w-full max-w-[360px]" style={{ aspectRatio: '320 / 285' }}>
        <svg viewBox="0 0 320 285" className="absolute inset-0 h-full w-full" role="img"
          aria-label={`Cycle day ${d.day} of ${L}. ${phase.name}. Next period in ${d.daysToPeriod} days.`}>
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
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9C9C96" strokeWidth=".7" />;
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
          {/* centre */}
          <text x={CX} y={CY - 44} textAnchor="middle" fontFamily="DM Mono, monospace" fontSize="10.5" letterSpacing="1.5" fill="hsl(var(--muted-foreground))">{phase.name.toUpperCase()}</text>
          <text x={CX} y={CY + 22} textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="62" fill="hsl(var(--foreground))">{d.day}</text>
          <text x={CX} y={CY + 44} textAnchor="middle" fontFamily="Jost, sans-serif" fontSize="13" fill="hsl(var(--muted-foreground))">of {L} days</text>
          <text x={CX} y={CY - R - 10} textAnchor="middle" fontFamily="DM Mono, monospace" fontSize="9.5" fill="#76766F">DAY 1</text>
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4 mt-1">
        <button type="button" onClick={() => go('#cycle-calendar')} className="text-left border-t border-foreground pt-2">
          <span className="label-mono block">Next period</span>
          <span className="block font-display text-[28px] leading-none mt-1">
            {d.daysToPeriod}<small className="font-sans text-xs text-muted-foreground ml-1">day{d.daysToPeriod === 1 ? '' : 's'}</small>
          </span>
          <span className="block text-[13px] text-muted-foreground mt-1">{format(d.nextPeriod, 'EEE d MMM')}</span>
        </button>
        <button type="button" onClick={() => go('#cycle-calendar')} className="text-left border-t border-primary pt-2">
          <span className="label-mono block !text-primary">{ttc ? 'Best days' : 'Fertile window'}</span>
          <span className="block text-[15px] font-medium mt-1.5">Day {d.fertileStart}–{d.fertileEnd}</span>
          <span className={`block text-[13px] mt-0.5 ${d.daysToFertile === 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{fertileLine}</span>
        </button>
        <button type="button" onClick={() => go('#daily-log')} className="text-left border-t border-border pt-2">
          <span className="label-mono block">Today</span>
          <span className="block text-[15px] font-medium mt-1.5">Log how you feel</span>
          <span className="block text-[13px] text-primary mt-0.5">Flow, mood, symptoms →</span>
        </button>
        <div className="text-left border-t border-border pt-2">
          <span className="label-mono block">Phase</span>
          <span className="block text-[15px] font-medium mt-1.5">{phase.name}</span>
          <span className="block text-[13px] text-muted-foreground mt-0.5">{phase.note}</span>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between border-t border-foreground pt-2.5">
        <p className="text-[13px] leading-snug">
          Predicted from the periods you logged.<br /><span className="text-muted-foreground">Log each period start to sharpen it.</span>
        </p>
        <p className="label-mono text-right leading-relaxed">Day {d.day} / {L}{first ? <><br />{first}</> : null}</p>
      </div>
    </section>
  );
}
