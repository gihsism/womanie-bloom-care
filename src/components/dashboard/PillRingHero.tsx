import { useCallback, useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { pillRing, pillFromNotes } from '@/lib/bodyMap';

// Version 8 hero for contraception: the pill pack as a ring of 28 pills.
// Solid ink = taken, ink with a halo = taken late, red cross = missed,
// open = not logged, faint = still to come; the last 7 are the break
// week when the pack start is known. Reads the same daily-signal notes
// ("Pill: on-time|late|missed") and pack start as ContraceptionDashboard;
// logging stays in that card (the button scrolls there).

const CX = 160; const CY = 135; const R = 104;
const lsKey = (userId: string, key: string) => `contraception:${userId}:${key}`;
const readLS = (userId: string, key: string): string | null => {
  try { const v = localStorage.getItem(lsKey(userId, key)); return v ? JSON.parse(v) : null; } catch { return null; }
};

export default function PillRingHero({ name }: { name?: string | null }) {
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
  const method = readLS(user.id, 'method') ?? 'pill';
  const reminder = readLS(user.id, 'reminderTime') ?? '21:00';
  const ring = pillRing(byDate, packStart, now);
  const first = name?.trim().split(/\s+/)[0];
  const takenToday = ring.todayMark === 'taken' || ring.todayMark === 'late';

  const toCard = () => {
    const el = document.getElementById('contraception');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/40', 'rounded-xl');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40', 'rounded-xl'), 1600);
    }
  };

  return (
    <section className="mb-6" aria-label="Your pill pack at a glance">
      <p className="label-mono">{first ? `${first} · ` : ''}{format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        {ring.packDay ? <>Pill {ring.packDay}</> : <>Your pill</>}<br />
        <span className="text-muted-foreground">{ring.packDay ? 'of twenty-eight' : 'last 28 days'}</span>
      </h2>

      <div className="relative mx-auto mt-2 w-full max-w-[360px]" style={{ aspectRatio: '320 / 270' }}>
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

      <div className="grid grid-cols-2 gap-x-5 gap-y-4 mt-1">
        <button type="button" onClick={toCard} className={`text-left border-t pt-2 ${takenToday ? 'border-foreground' : 'border-primary'}`}>
          <span className={`label-mono block ${takenToday ? '' : '!text-primary'}`}>Today</span>
          <span className="block text-[15px] font-medium mt-1.5">{takenToday ? (ring.todayMark === 'late' ? 'Taken, late ✓' : 'Taken ✓') : 'Not logged yet'}</span>
          <span className={`block text-[13px] mt-0.5 ${takenToday ? 'text-muted-foreground' : 'text-primary'}`}>{takenToday ? 'See you tomorrow' : 'Log today’s pill →'}</span>
        </button>
        <div className="text-left border-t border-border pt-2">
          <span className="label-mono block">Reminder</span>
          <span className="block font-display text-[26px] leading-none mt-1">{reminder}</span>
          <span className="block text-[13px] text-muted-foreground mt-1 capitalize">{method === 'pill' ? 'Pill' : method}</span>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between border-t border-foreground pt-2.5">
        <p className="text-[13px] leading-snug">
          {ring.packDay ? (ring.packDay > 21 ? 'Break week.' : `${21 - ring.packDay} active pills left in this pack.`) : 'Set your pack start to see the pack.'}
          <br /><span className="text-muted-foreground">Solid = taken · cross = missed.</span>
        </p>
        <p className="label-mono text-right leading-relaxed">{ring.packDay ? `No. ${ring.packDay} / 28` : '28 days'}{first ? <><br />{first}</> : null}</p>
      </div>
    </section>
  );
}
