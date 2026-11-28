import { WEEKDAY_DAY_MONTH_FMT } from '@/lib/dateFormat';
import { useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { hotFlushes, monthsSince, postMenopauseBleed, POST_MENOPAUSE_BLEED_TEXT } from '@/lib/bodyMap';
import { DetailsLink } from '@/components/dashboard/HomeBlocks';

// Version 8 "body map" hero for menopause and after: the same sculpted
// figure as pregnancy without the bump, with a scale counting the 12
// months without a period that mark menopause. Home keeps it to one fact
// (hot flushes this week, or months without a period), one sentence and
// one Details link; mood, medicines and the symptom calendar live on the
// Log sheet and the stage page.

const W = 320;
const H = 520;

export default function MenopauseBodyMap({ mode }: { name?: string | null; mode: string }) {
  const { user } = useAuth();
  const [signals, setSignals] = useState<{ signal_date: string; notes: string | null; mood: string | null }[]>([]);
  const [lastPeriod, setLastPeriod] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      const [sig, per] = await Promise.all([
        db.from('daily_health_signals').select('signal_date, notes, mood').eq('user_id', user.id)
          .gte('signal_date', format(subDays(new Date(), 7), 'yyyy-MM-dd')).order('signal_date', { ascending: false }),
        db.from('period_tracking').select('period_start_date').eq('user_id', user.id).order('period_start_date', { ascending: false }).limit(1),
      ]);
      if (!alive) return;
      setSignals((sig.data as typeof signals | null) ?? []);
      const p = (per.data as { period_start_date: string }[] | null)?.[0]?.period_start_date;
      setLastPeriod(p ? new Date(p) : null);
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
  const reached = months != null && months >= 12;
  const scaleY = (m: number) => 30 + (Math.min(12, m) / 12) * 260;

  const bleed = postMenopauseBleed(mode, months);
  const monthsText = months == null
    ? 'Log your last period to count the months.'
    : bleed ? POST_MENOPAUSE_BLEED_TEXT
    : reached
      ? `${months} months without a period: menopause is reached.`
      : months === 0
        ? 'You had a period this month. 12 months in a row without one marks menopause.'
        : `${months} month${months === 1 ? '' : 's'} without a period; 12 in a row marks menopause.`;

  return (
    <section className="mb-6" aria-label="Your body at a glance">
      <p className="label-mono">{format(now, WEEKDAY_DAY_MONTH_FMT)}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        {hf.daysLogged7
          ? <>Hot flushes <span className="text-muted-foreground">this week: {hf.total7}</span></>
          : months == null ? <>Your body <span className="text-muted-foreground">this week</span></>
          : reached ? <>{mode === 'post-menopause' ? 'After menopause' : 'Menopause reached'}</>
          : <>{months} month{months === 1 ? '' : 's'} <span className="text-muted-foreground">without a period</span></>}
      </h2>
      {/* Show a number once: when the heading already is the month count, the sentence explains it instead. */}
      <p className="mt-1 text-[15px]">
        {hf.daysLogged7 ? monthsText
          : months == null ? 'Log hot flushes and your last period to see how this week went.'
          : bleed ? POST_MENOPAUSE_BLEED_TEXT
          : '12 months in a row without a period marks menopause.'}
      </p>

      <div className="relative mx-auto mt-3 w-full max-w-[120px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="mb-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FCF6F4" /><stop offset=".55" stopColor="#EADDD9" /><stop offset="1" stopColor="#D9C8C3" />
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
          {months != null && (
            <g>
              <line x1="310" y1="30" x2="310" y2="290" stroke="hsl(var(--border))" strokeWidth=".8" />
              {Array.from({ length: 13 }, (_, i) => (
                <line key={i} x1="310" x2={i % 3 === 0 ? 304 : 307} y1={scaleY(i)} y2={scaleY(i)} stroke="hsl(var(--muted-foreground) / .5)" strokeWidth=".7" />
              ))}
              <line x1="310" y1="30" x2="310" y2={scaleY(months)} stroke="hsl(var(--primary))" strokeWidth="1.6" />
              <circle cx="310" cy={scaleY(months)} r="3.2" fill="hsl(var(--primary))" />
              <text x="301" y="34" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="hsl(var(--muted-foreground))">0</text>
              <text x="301" y="294" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="hsl(var(--muted-foreground))">12</text>
            </g>
          )}
        </svg>

      </div>

      <DetailsLink to="/dashboard/stage" />
    </section>
  );
}
