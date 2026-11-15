import { useEffect, useState } from 'react';
import { format, differenceInDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { onHealthDataChange } from '@/lib/data-events';
import { medsToday, weekWord } from '@/lib/bodyMap';
import { IVF_PHASES } from './IVFTracker';

// Version 8 hero for IVF: the protocol as one vertical scale, like a
// museum timeline. Done phases are solid ink, the current phase has the
// cobalt rings, the rest are open. Next to it: how long you've been in
// this phase, its first tip, and today's injections / medicines from the
// medicine log. Labels open the IVF tracker card or the medicine log.

export default function IVFTimelineHero({ startDate, phase, name }: { startDate: Date | null; phase: string | null; name?: string | null }) {
  const { user } = useAuth();
  const doses = useLifeEvents<{ medication_id?: string; name?: string }>('med_dose', { limit: 60 });
  const [meds, setMeds] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await db.from('medications').select('id, name').eq('user_id', user.id).eq('active', true);
      setMeds((data as { id: string; name: string }[] | null) ?? []);
    };
    load();
    return onHealthDataChange(load);
  }, [user]);

  const now = new Date();
  const idx = Math.max(0, IVF_PHASES.findIndex(p => p.key === phase));
  const current = IVF_PHASES[idx];
  const day = startDate ? Math.max(0, differenceInDays(now, startDate)) + 1 : null;
  const med = medsToday(meds, doses.events, now);
  const first = name?.trim().split(/\s+/)[0];
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/40', 'rounded-xl');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40', 'rounded-xl'), 1600);
    }
  };

  if (!phase || !startDate) {
    return (
      <section className="mb-6 border-t border-foreground pt-4" aria-label="Your IVF cycle">
        <p className="label-mono">IVF</p>
        <h2 className="font-display text-[34px] leading-[1.05] font-normal mt-1">Your cycle<br /><span className="text-muted-foreground">starts here</span></h2>
        <p className="text-[13px] text-muted-foreground mt-2 max-w-[34ch]">Set your start date and phase — the timeline, tips and today’s injections fill in from there.</p>
        <button type="button" onClick={() => go('ivf-tracker')} className="mt-3 rounded-full bg-foreground text-background px-4 py-2 text-[13px] font-medium">Set up IVF tracking</button>
      </section>
    );
  }

  const ROW = 34;
  return (
    <section className="mb-6" aria-label="Your IVF cycle at a glance">
      <p className="label-mono">{first ? `${first} · ` : ''}{format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        Phase {weekWord(idx + 1)}<br /><span className="text-muted-foreground">of {weekWord(IVF_PHASES.length)}</span>
      </h2>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] gap-x-3">
        {/* left: phase names (done = muted, current = ink) */}
        <ol className="text-right" aria-label="IVF phases">
          {IVF_PHASES.map((p, i) => (
            <li key={p.key} style={{ height: ROW }} className="flex flex-col justify-center leading-tight">
              <span className={`text-[13.5px] ${i === idx ? 'font-medium text-foreground' : i < idx ? 'text-muted-foreground' : 'text-foreground/80'}`}>
                {p.label.replace(' (TWW)', '')}
              </span>
              {i === idx && <span className="label-mono !text-primary !text-[9.5px]">now · day {day}</span>}
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
        {/* right: current-phase labels */}
        <div className="flex flex-col gap-4 pt-1">
          <button type="button" onClick={() => go('ivf-tracker')} className="text-left border-t border-primary pt-2">
            <span className="label-mono block !text-primary">{current.label.replace(' (TWW)', '')}</span>
            <span className="block font-display text-[28px] leading-none mt-1">Day {day}</span>
            <span className="block text-[12.5px] text-muted-foreground mt-1">usually {current.duration}</span>
          </button>
          <div className="text-left border-t border-border pt-2">
            <span className="label-mono block">Tip</span>
            <span className="block text-[13px] mt-1 leading-snug">{current.tips[0]}</span>
          </div>
          <button type="button" onClick={() => go('medicines')} className="text-left border-t border-border pt-2">
            <span className="label-mono block">Injections · meds</span>
            {med.total === 0 ? (
              <span className="block text-[13px] text-primary mt-1">Add your protocol →</span>
            ) : (
              <span className="block text-[15px] font-medium mt-1">{med.takenToday >= med.total ? 'All done ✓' : `${med.takenToday} of ${med.total} today`}</span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between border-t border-foreground pt-2.5">
        <p className="text-[13px] leading-snug">
          {idx < IVF_PHASES.length - 1 ? <>Next: <b className="font-medium">{IVF_PHASES[idx + 1].label.replace(' (TWW)', '')}</b>.</> : <>Last step of this cycle.</>}
          <br /><span className="text-muted-foreground">Update the phase in the IVF card below.</span>
        </p>
        <p className="label-mono text-right leading-relaxed">{idx + 1} / {IVF_PHASES.length}{first ? <><br />{first}</> : null}</p>
      </div>
    </section>
  );
}
