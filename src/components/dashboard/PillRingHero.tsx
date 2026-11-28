import { useCallback, useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { pillRing, pillFromNotes } from '@/lib/bodyMap';
import { DetailsLink } from '@/components/dashboard/HomeBlocks';
import {
  METHOD_DATES_KEY, METHOD_LABELS, contraceptionRows, isMethodId, localDay, parseMethodDates, ringPatchState, shortDay,
} from '@/lib/contraceptionSchedule';

// Version 8 hero for contraception: the pill pack as a ring of 28 pills.
// Solid ink = taken, ink with a halo = taken late, red cross = missed,
// open = not logged, faint = still to come; the last 7 are the break
// week when the pack start is known. Reads the same daily-signal notes
// ("Pill: on-time|late|missed") and pack start as ContraceptionDashboard.
// Home keeps it to one fact (pill day), one sentence (taken today?) and
// one Details link; logging is Home's primary button and the method card
// on the stage page.
// Other methods (IUD, implant, injection, ring, patch) get the method name
// and the next date she entered instead of the ring; a brand-new account
// with no method chosen (and no pill ticks) is asked to choose one.

const CX = 160; const CY = 135; const R = 104;
const lsKey = (userId: string, key: string) => `contraception:${userId}:${key}`;
const readLS = (userId: string, key: string): string | null => {
  try { const v = localStorage.getItem(lsKey(userId, key)); return v ? JSON.parse(v) : null; } catch { return null; }
};

export default function PillRingHero(_props: { name?: string | null }) {
  const { user } = useAuth();
  const [byDate, setByDate] = useState<Map<string, 'taken' | 'late' | 'missed'>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('daily_health_signals')
      .select('signal_date, notes')
      .eq('user_id', user.id)
      .gte('signal_date', format(subDays(new Date(), 60), 'yyyy-MM-dd'));
    const m = new Map<string, 'taken' | 'late' | 'missed'>();
    for (const r of (data as { signal_date: string; notes: string | null }[] | null) ?? []) {
      const s = pillFromNotes(r.notes);
      if (s) m.set(String(r.signal_date).slice(0, 10), s);
    }
    setByDate(m);
    setLoaded(true);
  }, [user]);
  useEffect(() => { load(); return onHealthDataChange(load); }, [load]);

  if (!user || !loaded) return null;
  const now = new Date();
  const packStart = readLS(user.id, 'packStartDate');
  const storedMethod = readLS(user.id, 'method');
  const method = storedMethod ?? 'pill';
  if (storedMethod == null && byDate.size === 0) {
    return (
      <section className="mb-6 border-t border-foreground pt-4" aria-label="Your contraception">
        <p className="label-mono">Contraception</p>
        <h2 className="font-display text-[34px] leading-[1.05] font-normal mt-1">Your method<br /><span className="text-muted-foreground">starts here</span></h2>
        <p className="text-[13px] text-muted-foreground mt-2 max-w-[34ch]">Choose the method you use: pill ticks, ring or patch change days, or your IUD, implant or injection dates fill in from there.</p>
        <DetailsLink to="/dashboard/stage#contraception" label="Choose your method" />
      </section>
    );
  }
  if (isMethodId(method) && method !== 'pill') {
    let dates;
    try { dates = parseMethodDates(localStorage.getItem(METHOD_DATES_KEY(user.id)))[method]; } catch { dates = undefined; }
    const today = localDay(now);
    const isCycle = method === 'ring' || method === 'patch';
    const cycle = isCycle && dates ? ringPatchState(method, dates, today) : null;
    const row = contraceptionRows(method, dates, now)[0];
    const sentence = row ? `${row.label}.`
      : cycle?.next ? `Next: ${cycle.next.label.toLowerCase()} on ${shortDay(cycle.next.date)}.`
      : dates?.replace ? `Replace by ${shortDay(dates.replace)} ${dates.replace.slice(0, 4)}.`
      : method === 'injection' && dates?.next ? `Next injection on ${shortDay(dates.next)}.`
      : null;
    return (
      <section className="mb-6" aria-label="Your contraception at a glance">
        <p className="label-mono">{format(now, 'EEE d MMM')}</p>
        <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
          {METHOD_LABELS[method]}
          {cycle?.cycleDay != null && <span className="text-muted-foreground"> · day {cycle.cycleDay}</span>}
        </h2>
        <p className="mt-1 text-[15px]">
          {sentence ?? (isCycle ? 'Add the day this cycle started to see your change days.' : 'Add the dates from your clinic card to see what is next.')}
        </p>
        <DetailsLink to="/dashboard/stage#contraception" label={sentence ? 'Details' : 'Add your dates'} />
      </section>
    );
  }
  const reminder = readLS(user.id, 'reminderTime') ?? '21:00';
  const isPill = method === 'pill';
  const ring = pillRing(byDate, packStart, now);
  const takenToday = ring.todayMark === 'taken' || ring.todayMark === 'late';

  return (
    <section className="mb-6" aria-label="Your pill pack at a glance">
      <p className="label-mono">{format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        {ring.packDay ? <>Pill {ring.packDay} <span className="text-muted-foreground">of 28</span></> : <>Your pill <span className="text-muted-foreground">· last 28 days</span></>}
      </h2>
      <p className="mt-1 text-[15px]">
        {!isPill ? 'Your method needs no daily pill.'
          : takenToday ? (ring.todayMark === 'late' ? "Today's pill is taken, a little late." : "Today's pill is taken.")
          : `Not logged yet today. Reminder at ${reminder}.`}
      </p>

      <div className="relative mx-auto mt-2 w-full max-w-[190px]" style={{ aspectRatio: '320 / 270' }}>
        <svg viewBox="0 0 320 270" className="absolute inset-0 h-full w-full" role="img"
          aria-label={`${takenToday ? "Today's pill taken" : "Today's pill not logged yet"}. ${ring.streak}-day streak.`}>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="hsl(var(--border))" strokeWidth=".8" strokeDasharray="1 5" />
          {ring.pills.map((p, i) => {
            const a = (i / 28) * 2 * Math.PI - Math.PI / 2;
            const x = CX + R * Math.cos(a); const y = CY + R * Math.sin(a);
            const r = p.placebo ? 5 : 7;
            const ink = 'hsl(var(--foreground))';
            return (
              <g key={p.date}>
                {p.today && <circle cx={x} cy={y} r={r + 7} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" />}
                {p.mark === 'taken' && <circle cx={x} cy={y} r={r} fill={ink} />}
                {p.mark === 'late' && <><circle cx={x} cy={y} r={r} fill={ink} /><circle cx={x} cy={y} r={r + 3} fill="none" stroke={ink} strokeWidth=".7" /></>}
                {p.mark === 'missed' && <><circle cx={x} cy={y} r={r} fill="none" stroke="hsl(var(--destructive))" strokeWidth="1.2" /><path d={`M${x - 3.5},${y - 3.5} L${x + 3.5},${y + 3.5} M${x + 3.5},${y - 3.5} L${x - 3.5},${y + 3.5}`} stroke="hsl(var(--destructive))" strokeWidth="1.2" /></>}
                {p.mark === 'none' && <circle cx={x} cy={y} r={r} fill="hsl(var(--background))" stroke={p.today ? 'hsl(var(--primary))' : ink} strokeWidth="1" />}
                {p.mark === 'future' && <circle cx={x} cy={y} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="1" />}
              </g>
            );
          })}
          <text x={CX} y={CY - 24} textAnchor="middle" fontFamily="DM Mono, monospace" fontSize="10.5" letterSpacing="1.5" fill="hsl(var(--muted-foreground))">STREAK</text>
          <text x={CX} y={CY + 22} textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontSize="58" fill="hsl(var(--foreground))">{ring.streak}</text>
          <text x={CX} y={CY + 44} textAnchor="middle" fontFamily="Jost, sans-serif" fontSize="13" fill="hsl(var(--muted-foreground))">day{ring.streak === 1 ? '' : 's'} in a row</text>
        </svg>
      </div>

      <DetailsLink to="/dashboard/stage#contraception" />
    </section>
  );
}
