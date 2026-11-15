import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { onHealthDataChange } from '@/lib/data-events';
import { lastFeed, countToday, nappiesToday, sleepTodayMin, fmtAgo, dayOfLife, fmtGrams, weekWord } from '@/lib/bodyMap';

// Version 8 "body map" hero for after birth: a sculpted swaddled baby,
// hotspots labelled with the live baby log (last feed + which side next,
// sleep, nappies today, latest weight). Labels open the baby tracker on
// the matching tab. Same 320 x 520 coordinate box as PregnancyBodyMap.

const W = 320;
const H = 500;
const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

interface Baby { id: string; name: string | null; birth_date: string | null }

const SLEEP_ACTIVE_KEY = (babyId: string) => `womanie_baby_sleep_active_${babyId}`;

export default function BabyBodyMap() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [baby, setBaby] = useState<Baby | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [birthWeight, setBirthWeight] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db.from('babies').select('id, name, birth_date').eq('user_id', user.id).order('created_at', { ascending: true });
    const b = ((data as Baby[] | null) ?? [])[0] ?? null;
    setBaby(b);
    if (b) {
      const { data: br } = await db.from('birth_records').select('birth_weight_g').eq('user_id', user.id).eq('baby_id', b.id);
      const g = Number((br as { birth_weight_g: number | null }[] | null)?.[0]?.birth_weight_g);
      setBirthWeight(Number.isFinite(g) && g > 0 ? g : null);
    }
    setLoaded(true);
  }, [user]);
  useEffect(() => { load(); return onHealthDataChange(load); }, [load]);

  const babyId = baby?.id ?? null;
  const feeds = useLifeEvents('feed', { babyId, limit: 60 });
  const nappies = useLifeEvents('nappy', { babyId, limit: 60 });
  const sleeps = useLifeEvents('baby_sleep', { babyId, limit: 40 });
  const growth = useLifeEvents<{ weight_g?: number }>('baby_growth', { babyId, limit: 20 });

  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 60000); return () => window.clearInterval(t); }, []);

  if (!loaded) return null;
  const open = (tab: string) => navigate(`/dashboard/baby?tab=${tab}`);

  if (!baby) {
    return (
      <section className="mb-6 border-t border-foreground pt-4" aria-label="Your baby">
        <p className="label-mono">After birth</p>
        <h2 className="font-display text-[34px] leading-[1.05] font-normal mt-1">Your baby<br /><span className="text-muted-foreground">starts here</span></h2>
        <p className="text-[13px] text-muted-foreground mt-2 max-w-[34ch]">Add your baby to log feeds, sleep, nappies and growth — the figure fills in as you go.</p>
        <button type="button" onClick={() => open('feed')} className="mt-3 rounded-full bg-foreground text-background px-4 py-2 text-[13px] font-medium">Add your baby</button>
      </section>
    );
  }

  const now = new Date();
  const name = baby.name?.trim() || 'Baby';
  const day = dayOfLife(baby.birth_date, now);
  const lf = lastFeed(feeds.events, now);
  const feedsToday = countToday(feeds.events, now);
  const np = nappiesToday(nappies.events, now);
  const sleptMin = Math.round(sleepTodayMin(sleeps.events, now));
  let asleepSince: number | null = null;
  try { const v = localStorage.getItem(SLEEP_ACTIVE_KEY(baby.id)); asleepSince = v ? Number(v) : null; } catch { /* private mode */ }
  const asleepMin = asleepSince ? Math.max(0, Math.round((now.getTime() - asleepSince) / 60000)) : null;
  const latestG = Number(growth.events[0]?.data?.weight_g);
  const weight = Number.isFinite(latestG) && latestG > 0 ? latestG : birthWeight;
  const gain = weight && birthWeight && weight !== birthWeight ? weight - birthWeight : null;
  const ago = lf ? fmtAgo(lf.minutesAgo) : null;
  const side = (m: string) => (m === 'breast_l' ? 'Left side' : m === 'breast_r' ? 'Right side' : m === 'bottle' ? 'Bottle' : 'Feed');

  return (
    <section className="mb-6" aria-label="Your baby at a glance">
      <p className="label-mono">{name} · {format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        {day && day > 0 && day < 50 ? <>Day {weekWord(day)}</> : <>{name}</>}<br /><span className="text-muted-foreground">{day && day > 0 && day < 50 ? 'of life' : 'today'}</span>
      </h2>

      <div className="relative mx-auto mt-3 w-full max-w-[380px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="bb-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F6F6F3" /><stop offset=".55" stopColor="#DEDDD8" /><stop offset="1" stopColor="#CBCAC4" />
            </linearGradient>
            <radialGradient id="bb-glow" cx=".5" cy=".5" r=".6">
              <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity=".2" />
              <stop offset=".7" stopColor="hsl(var(--primary))" stopOpacity=".05" />
              <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </radialGradient>
            <filter id="bb-shadow" x="-30%" y="-10%" width="160%" height="130%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="10" /><feOffset dx="8" dy="10" />
              <feComponentTransfer><feFuncA type="linear" slope=".14" /></feComponentTransfer>
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform="translate(-48,-170)" stroke="#1A1A19">
            <ellipse cx="236" cy="640" rx="70" ry="6" fill="#1A1A19" opacity=".08" stroke="none" />
            <g filter="url(#bb-shadow)">
              <ellipse cx="232" cy="248" rx="46" ry="50" fill="url(#bb-stone)" strokeWidth="1.2" />
              <path d="M186,300 C176,330 168,380 172,450 C176,530 200,600 236,628 C272,600 296,530 300,450 C304,380 296,330 280,300 C264,286 248,282 232,282 C214,282 200,288 186,300 Z" fill="url(#bb-stone)" strokeWidth="1.2" strokeLinejoin="round" />
            </g>
            <path d="M186,302 C210,330 250,346 294,330" fill="none" strokeWidth="1" opacity=".7" />
            <path d="M176,420 C210,404 256,398 300,410" fill="none" strokeWidth=".8" opacity=".4" />
            <path d="M232,346 C228,420 230,520 236,626" fill="none" strokeWidth=".8" opacity=".35" />
            <path d="M212,244 q7,5 14,0 M240,244 q7,5 14,0" fill="none" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M227,268 q5,3 10,0" fill="none" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="236" cy="452" r="62" fill="url(#bb-glow)" stroke="none" />
          </g>
          {/* leaders (box coordinates) */}
          <g fill="none" strokeWidth="1">
            <path d="M184,100 H116 M116,95 v10" stroke="hsl(var(--primary))" />
            <path d="M206,74 H252 V50 M247,50 h10" stroke="#1A1A19" />
            <path d="M188,390 H116 M116,385 v10" stroke="#1A1A19" />
            <path d="M238,282 H272 V336 M267,336 h10" stroke="#1A1A19" />
          </g>
          <g>
            <circle cx="184" cy="100" r="4.5" fill="hsl(var(--primary))" />
            <circle cx="184" cy="100" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth=".9" />
            <circle cx="184" cy="100" r="16" fill="none" stroke="hsl(var(--primary))" strokeWidth=".6" opacity=".45" />
            <circle cx="206" cy="74" r="3.5" fill="#1A1A19" /><circle cx="206" cy="74" r="8" fill="none" stroke="#1A1A19" strokeWidth=".8" />
            <circle cx="188" cy="390" r="3.5" fill="#1A1A19" /><circle cx="188" cy="390" r="8" fill="none" stroke="#1A1A19" strokeWidth=".8" />
            <circle cx="238" cy="282" r="3.5" fill="#1A1A19" /><circle cx="238" cy="282" r="8" fill="none" stroke="#1A1A19" strokeWidth=".8" />
          </g>
        </svg>

        {/* Mouth · feed */}
        <button type="button" onClick={() => open('feed')} className="absolute w-[35%] text-right leading-tight" style={pct(0, 66)}>
          <span className="label-mono block !text-primary">Mouth · feed</span>
          {lf && ago ? (
            <>
              <span className="block font-display text-[30px] leading-none mt-1 text-primary">
                {ago.value}<small className="font-sans text-xs text-muted-foreground ml-1">{ago.unit ? `${ago.unit} ago` : 'ago'}</small>
              </span>
              <span className="block text-[13px] text-muted-foreground mt-1">
                {side(lf.method)}{lf.durationMin ? `, ${lf.durationMin} min` : lf.ml ? `, ${lf.ml} ml` : ''}.
                {lf.nextSide && <><br /><b className="font-medium text-foreground">Next: {lf.nextSide}.</b></>}
              </span>
            </>
          ) : (
            <>
              <span className="block text-[15px] font-medium mt-1">No feeds yet</span>
              <span className="block text-[13px] text-primary mt-0.5">Log a feed →</span>
            </>
          )}
        </button>

        {/* Eyes · sleep */}
        <button type="button" onClick={() => open('sleep')} className="absolute w-[33%] text-left leading-tight" style={pct(214, -2)}>
          <span className="label-mono block">Eyes · sleep</span>
          <span className="block text-[15px] font-medium mt-1">{asleepMin != null ? `Asleep ${fmtAgo(asleepMin).value}${fmtAgo(asleepMin).unit ? ' min' : ''}` : sleptMin ? 'Awake' : 'Log sleep'}</span>
          <span className="block text-[13px] text-muted-foreground mt-0.5">{sleptMin ? `${fmtAgo(sleptMin).value}${fmtAgo(sleptMin).unit ? ' min' : ''} today` : 'nothing yet today'}</span>
        </button>

        {/* Nappy · today */}
        <button type="button" onClick={() => open('nappy')} className="absolute w-[35%] text-right leading-tight" style={pct(0, 352)}>
          <span className="label-mono block">Nappy · today</span>
          <span className="flex justify-end items-baseline gap-3 mt-1">
            <span><span className="font-display text-[28px] leading-none">{np.wet}</span> <span className="text-[12px] text-muted-foreground">wet</span></span>
            <span><span className="font-display text-[28px] leading-none">{np.dirty}</span> <span className="text-[12px] text-muted-foreground">dirty</span></span>
          </span>
          <span className="block text-[13px] text-primary mt-1">Log a nappy →</span>
        </button>

        {/* Growth */}
        <button type="button" onClick={() => open('growth')} className="absolute w-[26%] text-left leading-tight" style={pct(240, 344)}>
          <span className="label-mono block">Growth</span>
          {weight ? (
            <>
              <span className="block font-display text-[28px] leading-none mt-1">{fmtGrams(weight).value}<small className="font-sans text-xs text-muted-foreground ml-1">{fmtGrams(weight).unit}</small></span>
              {gain != null && <span className="block text-[12.5px] text-muted-foreground mt-1">{gain > 0 ? '+' : ''}{gain} g since birth</span>}
            </>
          ) : (
            <span className="block text-[13px] text-primary mt-1">Add weight →</span>
          )}
        </button>
      </div>

      <div className="mt-1 grid grid-cols-4 gap-1.5">
        {[['feed', '+ Feed'], ['nappy', '+ Nappy'], ['sleep', '+ Sleep'], ['stats', 'Stats']].map(([tab, label], i) => (
          <button key={tab} type="button" onClick={() => open(tab)}
            className={`rounded-full border border-foreground py-2 text-[12.5px] font-medium ${i === 0 ? 'bg-foreground text-background' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-start justify-between border-t border-foreground pt-2.5">
        <p className="text-[13px] leading-snug">
          {feedsToday ? <>{feedsToday} feed{feedsToday === 1 ? '' : 's'} today.</> : <>No feeds logged today.</>}
          <br /><span className="text-muted-foreground">Touch any label to log or look back.</span>
        </p>
        <p className="label-mono text-right leading-relaxed">{day ? <>No. {day}<br /></> : null}{name}</p>
      </div>
    </section>
  );
}
