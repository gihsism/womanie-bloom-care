import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { onHealthDataChange } from '@/lib/data-events';
import { lastFeed, countToday, nappiesToday, sleepTodayMin, fmtAgo, dayOfLife } from '@/lib/bodyMap';
import { DetailsLink } from '@/components/dashboard/HomeBlocks';

// Version 8 "body map" hero for after birth: a sculpted swaddled baby.
// Home keeps it to one fact (last feed), one sentence (feeds, nappies and
// sleep today) and one link, "Baby tracker"; logging and growth live on
// /dashboard/baby. Same coordinate box as PregnancyBodyMap.

const W = 320;
const H = 536;

interface Baby { id: string; name: string | null; birth_date: string | null }

const SLEEP_ACTIVE_KEY = (babyId: string) => `womanie_baby_sleep_active_${babyId}`;

export default function BabyBodyMap() {
  const { user } = useAuth();
  const [baby, setBaby] = useState<Baby | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db.from('babies').select('id, name, birth_date').eq('user_id', user.id).order('created_at', { ascending: true });
    const b = ((data as Baby[] | null) ?? [])[0] ?? null;
    setBaby(b);
    setLoaded(true);
  }, [user]);
  useEffect(() => { load(); return onHealthDataChange(load); }, [load]);

  const babyId = baby?.id ?? null;
  const feeds = useLifeEvents('feed', { babyId, limit: 60 });
  const nappies = useLifeEvents('nappy', { babyId, limit: 60 });
  const sleeps = useLifeEvents('baby_sleep', { babyId, limit: 40 });

  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 60000); return () => window.clearInterval(t); }, []);

  if (!loaded) return null;

  if (!baby) {
    return (
      <section className="mb-6 border-t border-foreground pt-4" aria-label="Your baby">
        <p className="label-mono">After birth</p>
        <h2 className="font-display text-[34px] leading-[1.05] font-normal mt-1">Your baby<br /><span className="text-muted-foreground">starts here</span></h2>
        <p className="text-[13px] text-muted-foreground mt-2 max-w-[34ch]">Add your baby to log feeds, sleep, nappies and growth — the figure fills in as you go.</p>
        <DetailsLink to="/dashboard/baby?tab=feed&add=1" label="Add your baby" />
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
  const ago = lf ? fmtAgo(lf.minutesAgo) : null;
  const nappyCount = np.wet + np.dirty;
  const sleepText = asleepMin != null ? 'asleep now' : sleptMin ? `slept ${fmtAgo(sleptMin).value}${fmtAgo(sleptMin).unit ? ' min' : ''} today` : null;
  const facts = [
    `${feedsToday} feed${feedsToday === 1 ? '' : 's'} today`,
    `${nappyCount} napp${nappyCount === 1 ? 'y' : 'ies'}`,
    sleepText,
  ].filter(Boolean).join(', ');

  return (
    <section className="mb-6" aria-label="Your baby at a glance">
      <p className="label-mono">{name} · {format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        {ago ? <>Last feed <span className="text-muted-foreground">{ago.value}{ago.unit ? ` ${ago.unit}` : ''} ago</span></> : <>No feeds yet</>}
      </h2>
      <p className="mt-1 text-[15px]">
        {facts}.{lf?.nextSide ? ` Next: ${lf.nextSide}.` : ''}{day && day > 0 && day < 50 ? ` Day ${day} of life.` : ''}
      </p>

      <div className="relative mx-auto mt-3 w-full max-w-[180px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="bb-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FCF6F4" /><stop offset=".55" stopColor="#EADDD9" /><stop offset="1" stopColor="#D9C8C3" />
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
          <g transform="translate(-48,-134)" stroke="#1A1A19">
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
        </svg>

      </div>

      <DetailsLink to="/dashboard/baby" label="Baby tracker" />
    </section>
  );
}
