import { useMemo } from 'react';
import { format, differenceInDays } from 'date-fns';
import { IVF_PHASES } from './ivfPhases';
import { DetailsLink } from '@/components/dashboard/HomeBlocks';
import { useIvfPlan } from '@/hooks/useIvfPlan';
import { daysBetween, ivfStatus, localDate, nextKeyDate } from '@/lib/ivfJourney';
import { deviceTz, fmtDay, fmtMoment, inDays } from './ivf/ivfFormat';

// Version 8 hero for IVF: the protocol as one vertical scale, like a
// museum timeline. Done phases are solid ink, the current phase has the
// cobalt rings, the rest are open. Home keeps it to one fact (phase and
// day), one sentence (what comes next) and one Details link; the phase
// picker and medicines live on the stage page and the Log sheet.

// When she has entered her clinic's dates (ivf_plans), the phase, stim day
// and next key date come from them (src/lib/ivfJourney.ts); otherwise from
// the phase she picked by hand.
export default function IVFTimelineHero({ startDate, phase: pickedPhase }: { startDate: Date | null; phase: string | null; name?: string | null }) {
  const now = new Date();
  const tz = useMemo(() => deviceTz(), []);
  const { plan } = useIvfPlan();
  const status = ivfStatus(plan, now, tz);
  const next = nextKeyDate(plan, now, tz);
  const phase = status.phase ?? pickedPhase;
  const idx = Math.max(0, IVF_PHASES.findIndex(p => p.key === phase));
  const current = IVF_PHASES[idx];
  const day = status.stimDay
    ?? (status.phaseStart ? daysBetween(status.phaseStart, localDate(now, tz)) + 1
      : startDate ? Math.max(0, differenceInDays(now, startDate)) + 1 : null);
  if (!phase || day == null) {
    return (
      <section className="mb-6 border-t border-foreground pt-4" aria-label="Your IVF cycle">
        <p className="label-mono">IVF</p>
        <h2 className="font-display text-[34px] leading-[1.05] font-normal mt-1">Your cycle<br /><span className="text-muted-foreground">starts here</span></h2>
        <p className="text-[13px] text-muted-foreground mt-2 max-w-[34ch]">Set your start date and phase — the timeline, tips and today’s injections fill in from there.</p>
        <DetailsLink to="/dashboard/stage#ivf-tracker" label="Set up IVF tracking" />
      </section>
    );
  }

  const ROW = 34;
  const label = (k: number) => IVF_PHASES[k].label.replace(' (TWW)', '');
  const nextLine = next
    ? `Next: ${next.label}, ${next.at ? fmtMoment(next.at, tz) : fmtDay(next.date)} (${inDays(next.daysUntil)}).`
    : idx < IVF_PHASES.length - 1 ? `This phase usually lasts ${current.duration}. Next: ${label(idx + 1)}.` : 'The last step of this cycle.';
  return (
    <section className="mb-6" aria-label="Your IVF cycle at a glance">
      <p className="label-mono">{format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        {label(idx)} <span className="text-muted-foreground">· {status.stimDay != null ? 'stim ' : ''}day {day}</span>
      </h2>
      <p className="mt-1 text-[15px]">{nextLine}</p>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] gap-x-3">
        {/* left: phase names (done = muted, current = ink) */}
        <ol className="text-right" aria-label="IVF phases">
          {IVF_PHASES.map((p, i) => (
            <li key={p.key} style={{ height: ROW }} className="flex flex-col justify-center leading-tight">
              <span className={`text-[13.5px] ${i === idx ? 'font-medium text-foreground' : i < idx ? 'text-muted-foreground' : 'text-foreground/80'}`}>
                {p.label.replace(' (TWW)', '')}
              </span>
            </li>
          ))}
        </ol>
        {/* centre: the scale */}
        <svg width="40" height={ROW * IVF_PHASES.length} aria-hidden="true">
          <line x1="20" x2="20" y1={ROW / 2} y2={ROW * (IVF_PHASES.length - 0.5)} stroke="hsl(var(--border))" strokeWidth="1" />
          <line x1="20" x2="20" y1={ROW / 2} y2={ROW * (idx + 0.5)} stroke="hsl(var(--foreground))" strokeWidth="1.6" />
          {IVF_PHASES.map((p, i) => {
            const y = ROW * (i + 0.5);
            if (i === idx) return (
              <g key={p.key}>
                <circle cx="20" cy={y} r="5" fill="hsl(var(--primary))" />
                <circle cx="20" cy={y} r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth=".9" />
                <circle cx="20" cy={y} r="15" fill="none" stroke="hsl(var(--primary))" strokeWidth=".6" opacity=".45" />
              </g>
            );
            return <circle key={p.key} cx="20" cy={y} r="3.6" fill={i < idx ? 'hsl(var(--foreground))' : 'hsl(var(--background))'} stroke="hsl(var(--foreground))" strokeWidth="1" />;
          })}
        </svg>
        <div />
      </div>

      <DetailsLink to="/dashboard/stage#ivf-tracker" />
    </section>
  );
}
