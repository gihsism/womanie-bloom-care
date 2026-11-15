import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { onHealthDataChange } from '@/lib/data-events';
import { hotFlushes, monthsSince, medsToday, weekWord } from '@/lib/bodyMap';

// Version 8 "body map" hero for menopause and after: the same sculpted
// figure as pregnancy without the bump. Hotspots: mind (latest mood),
// chest (hot flushes today / this week), hand (HRT & medicines today),
// pelvis (months since the last period — 12 in a row means menopause).
// The scale on the right counts those 12 months.

const W = 320;
const H = 520;
const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

export default function MenopauseBodyMap({ name, mode }: { name?: string | null; mode: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const doses = useLifeEvents<{ medication_id?: string; name?: string }>('med_dose', { limit: 60 });
  const [meds, setMeds] = useState<{ id: string; name: string }[]>([]);
  const [signals, setSignals] = useState<{ signal_date: string; notes: string | null; mood: string | null }[]>([]);
  const [lastPeriod, setLastPeriod] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      const [sig, per, med] = await Promise.all([
        db.from('daily_health_signals').select('signal_date, notes, mood').eq('user_id', user.id)
          .gte('signal_date', format(subDays(new Date(), 7), 'yyyy-MM-dd')).order('signal_date', { ascending: false }),
        db.from('period_tracking').select('period_start_date').eq('user_id', user.id).order('period_start_date', { ascending: false }).limit(1),
        db.from('medications').select('id, name').eq('user_id', user.id).eq('active', true),
      ]);
      if (!alive) return;
      setSignals((sig.data as typeof signals | null) ?? []);
      const p = (per.data as { period_start_date: string }[] | null)?.[0]?.period_start_date;
      setLastPeriod(p ? new Date(p) : null);
      setMeds((med.data as { id: string; name: string }[] | null) ?? []);
      setLoaded(true);
    };
    load();
    const off = onHealthDataChange(load);
    return () => { alive = false; off(); };
  }, [user]);

  if (!loaded) return null;
  const now = new Date();
  const hf = hotFlushes(signals, now);
  const months = monthsSince(lastPeriod, now);
  const med = medsToday(meds, doses.events, now);
  const mood = signals.find(s => s.mood)?.mood ?? null;
  const first = name?.trim().split(/\s+/)[0];
  const reached = months != null && months >= 12;
  const scaleY = (m: number) => 30 + (Math.min(12, m) / 12) * 260;

  const go = (target: string) => {
    if (target.startsWith('/')) { navigate(target); return; }
    const el = document.getElementById(target.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/40', 'rounded-xl');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40', 'rounded-xl'), 1600);
    }
  };

  return (
    <section className="mb-6" aria-label="Your body at a glance">
      <p className="label-mono">{first ? `${first} · ` : ''}{format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        {months == null ? <>Your body<br /><span className="text-muted-foreground">this week</span></>
          : reached ? <>{mode === 'post-menopause' ? 'After' : 'Menopause'}<br /><span className="text-muted-foreground">{mode === 'post-menopause' ? 'menopause' : 'reached'}</span></>
          : <>{weekWord(months).replace(/^./, c => c.toUpperCase())} month{months === 1 ? '' : 's'}<br /><span className="text-muted-foreground">without a period</span></>}
      </h2>

      <div className="relative mx-auto mt-3 w-full max-w-[380px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="mb-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F6F6F3" /><stop offset=".55" stopColor="#DEDDD8" /><stop offset="1" stopColor="#CBCAC4" />
            </linearGradient>
            <filter id="mb-shadow" x="-30%" y="-10%" width="160%" height="130%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="10" /><feOffset dx="8" dy="10" />
              <feComponentTransfer><feFuncA type="linear" slope=".14" /></feComponentTransfer>
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <ellipse cx="170" cy="500" rx="46" ry="5" fill="#1A1A19" opacity=".08" />
          <g transform="translate(56.6,-31) scale(0.8)" stroke="#1A1A19">
            <g filter="url(#mb-shadow)">
              <ellipse cx="152" cy="74" rx="29" ry="35" transform="rotate(-12 152 74)" fill="url(#mb-stone)" strokeWidth="1.2" />
              <circle cx="118" cy="56" r="15" fill="url(#mb-stone)" strokeWidth="1.2" />
              <path d="M140,104 C141,114 141,122 136,130 C122,140 114,160 113,190 C112,240 112,280 118,318 C106,346 98,372 104,400 C110,440 118,470 120,510 C122,560 126,600 128,644 L130,656 C150,660 170,660 186,656 C174,648 162,640 158,630 C156,590 158,560 164,530 C170,500 176,470 178,440 C180,425 182,418 186,410 C196,392 200,356 198,316 C196,284 194,258 192,238 C206,228 208,192 188,170 C178,158 170,150 168,142 C164,128 162,118 160,108 Z"
                fill="url(#mb-stone)" strokeWidth="1.2" strokeLinejoin="round" />
            </g>
            <path d="M132,150 C124,200 126,250 140,290" fill="none" strokeWidth="1" strokeLinecap="round" opacity=".55" />
            <path d="M140,290 C150,330 166,360 186,376 C192,380 198,381 204,378" fill="none" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M150,452 C146,520 146,580 150,640" fill="none" strokeWidth=".9" opacity=".35" />
          </g>
          <g fill="none" strokeWidth="1">
            <path d="M171,22 H116 M116,17 v10" stroke="#1A1A19" />
            <path d="M186,118 H116 M116,113 v10" stroke="hsl(var(--primary))" />
            <path d="M216,271 H116 M116,266 v10" stroke="#1A1A19" />
            <path d="M206,300 L262,300 V330 M257,330 h10" stroke="#1A1A19" />
          </g>
          <g>
            <circle cx="171" cy="22" r="3.5" fill="#1A1A19" /><circle cx="171" cy="22" r="8" fill="none" stroke="#1A1A19" strokeWidth=".8" />
            <circle cx="186" cy="118" r="4.5" fill="hsl(var(--primary))" />
            <circle cx="186" cy="118" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth=".9" />
            <circle cx="186" cy="118" r="16" fill="none" stroke="hsl(var(--primary))" strokeWidth=".6" opacity=".45" />
            <circle cx="216" cy="271" r="3.5" fill="#1A1A19" /><circle cx="216" cy="271" r="8" fill="none" stroke="#1A1A19" strokeWidth=".8" />
            <circle cx="206" cy="300" r="3.5" fill="#1A1A19" /><circle cx="206" cy="300" r="8" fill="none" stroke="#1A1A19" strokeWidth=".8" />
          </g>
          {months != null && (
            <g>
              <line x1="310" y1="30" x2="310" y2="290" stroke="hsl(var(--border))" strokeWidth=".8" />
              {Array.from({ length: 13 }, (_, i) => (
                <line key={i} x1="310" x2={i % 3 === 0 ? 304 : 307} y1={scaleY(i)} y2={scaleY(i)} stroke="#9C9C96" strokeWidth=".7" />
              ))}
              <line x1="310" y1="30" x2="310" y2={scaleY(months)} stroke="hsl(var(--primary))" strokeWidth="1.6" />
              <circle cx="310" cy={scaleY(months)} r="3.2" fill="hsl(var(--primary))" />
              <text x="301" y={scaleY(months) + 4} textAnchor="end" fontFamily="DM Mono, monospace" fontSize="10.5" fill="hsl(var(--primary))">{Math.min(months, 12)}</text>
              <text x="301" y="34" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="#76766F">0</text>
              <text x="301" y="294" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="#76766F">12</text>
            </g>
          )}
        </svg>

        <button type="button" onClick={() => go('#daily-log')} className="absolute w-[35%] text-right leading-tight" style={pct(0, 0)}>
          <span className="label-mono block">Mind · mood</span>
          <span className="block text-[15px] font-medium mt-1 capitalize">{mood ?? 'Not logged'}</span>
          <span className="block text-[13px] text-primary mt-0.5">{mood ? 'Update today →' : 'How do you feel? →'}</span>
        </button>

        <button type="button" onClick={() => go('#symptoms')} className="absolute w-[35%] text-right leading-tight" style={pct(0, 82)}>
          <span className="label-mono block !text-primary">Chest · hot flushes</span>
          <span className="block font-display text-[30px] leading-none mt-1">
            {hf.today ?? '—'}<small className="font-sans text-xs text-muted-foreground ml-1">today</small>
          </span>
          <span className="block text-[13px] text-muted-foreground mt-1">
            {hf.daysLogged7 ? `${hf.total7} this week` : 'Log them to see patterns'}
          </span>
        </button>

        <button type="button" onClick={() => go('#medicines')} className="absolute w-[35%] text-right leading-tight" style={pct(0, 245)}>
          <span className="label-mono block">Hand · HRT</span>
          {med.total === 0 ? (
            <><span className="block text-[15px] font-medium mt-1">No medicines</span><span className="block text-[13px] text-primary mt-0.5">Add HRT or vitamins →</span></>
          ) : med.takenToday >= med.total ? (
            <><span className="block text-[15px] font-medium mt-1">All taken ✓</span><span className="block text-[13px] text-muted-foreground mt-0.5">Today’s doses, done.</span></>
          ) : (
            <><span className="block text-[15px] font-medium mt-1">{med.takenToday} of {med.total} taken</span><span className="block text-[13px] text-primary mt-0.5">Log a dose →</span></>
          )}
        </button>

        <button type="button" onClick={() => go('#menopause-stage')} className="absolute w-[38%] text-left leading-tight" style={pct(200, 340)}>
          <span className="label-mono block">Last period</span>
          {lastPeriod ? (
            <>
              <span className="block font-display text-[30px] leading-none mt-1">{format(lastPeriod, 'd MMM')}</span>
              <span className="block text-[13px] text-muted-foreground mt-1">
                {reached ? '12+ months — menopause' : months != null ? `${12 - months} more month${12 - months === 1 ? '' : 's'} to 12` : ''}
              </span>
            </>
          ) : (
            <span className="block text-[13px] text-primary mt-1">Log your last period →</span>
          )}
        </button>
      </div>

      <div className="mt-2 flex items-start justify-between border-t border-foreground pt-2.5">
        <p className="text-[13px] leading-snug">
          {reached ? 'Twelve months without a period marks menopause.' : '12 months in a row without a period marks menopause.'}
          <br /><span className="text-muted-foreground">Touch any label to log or look back.</span>
        </p>
        <p className="label-mono text-right leading-relaxed">{months != null ? `${Math.min(months, 12)} / 12` : '—'}{first ? <><br />{first}</> : null}</p>
      </div>
    </section>
  );
}
