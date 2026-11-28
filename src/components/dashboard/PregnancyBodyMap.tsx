import { WEEKDAY_DAY_MONTH_FMT } from '@/lib/dateFormat';
import { format, differenceInCalendarDays } from 'date-fns';
import { fmtGrams } from '@/lib/bodyMap';
import { getWeekData } from './pregnancyWeekData';
import { DetailsLink } from '@/components/dashboard/HomeBlocks';

// Version 8 "body map" hero for pregnancy: a sculpted figure on the
// gallery wall with the 40-week scale beside it. Home keeps it to one
// fact (the week), one sentence (baby's size, days to go) and one
// Details link; visits, results, medicines and kick counts live on
// Today, Visits, Records and the stage page.
//
// Drawn in a fixed 320 x 520 coordinate box so the figure scales with the screen.

const W = 320;
const H = 520;

export default function PregnancyBodyMap({ dueDate }: { dueDate: Date; name?: string | null }) {
  const now = new Date();
  const conception = dueDate.getTime() - 280 * 86400000;
  const week = Math.min(42, Math.max(0, Math.floor((now.getTime() - conception) / (7 * 86400000))));
  const daysLeft = Math.max(0, differenceInCalendarDays(dueDate, now));
  const wk = getWeekData(Math.max(4, Math.min(40, week)));
  const grams = wk.weightG?.median ?? null;
  const size = grams != null ? fmtGrams(grams) : null;
  const scaleY = (w: number) => 30 + (Math.min(40, w) / 40) * 260;

  return (
    <section className="mb-6" aria-label="Your pregnancy at a glance">
      <p className="label-mono">{format(now, WEEKDAY_DAY_MONTH_FMT)}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        Week {week} <span className="text-muted-foreground">of 40</span>
      </h2>
      <p className="mt-1 text-[15px]">
        Baby is about the size of {/^[aeiou]/i.test(wk.size) ? 'an' : 'a'} {wk.size.toLowerCase()}{size ? ` (${size.value} ${size.unit})` : ''}.{' '}
        {daysLeft > 0 ? `${daysLeft} days to go, due ${format(dueDate, 'd MMMM')}.` : 'Due date reached: any day now.'}
      </p>

      <div className="relative mx-auto mt-3 w-full max-w-[120px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="bm-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FCF6F4" /><stop offset=".55" stopColor="#EADDD9" /><stop offset="1" stopColor="#D9C8C3" />
            </linearGradient>
            <radialGradient id="bm-glow" cx=".55" cy=".45" r=".6">
              <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity=".22" />
              <stop offset=".7" stopColor="hsl(var(--primary))" stopOpacity=".06" />
              <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </radialGradient>
            <filter id="bm-shadow" x="-30%" y="-10%" width="160%" height="130%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="10" />
              <feOffset dx="8" dy="10" />
              <feComponentTransfer><feFuncA type="linear" slope=".14" /></feComponentTransfer>
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <ellipse cx="175" cy="500" rx="52" ry="5" fill="#1A1A19" opacity=".08" />
          <g transform="translate(56.6,-31) scale(0.8)" stroke="#1A1A19">
            <g filter="url(#bm-shadow)">
              <ellipse cx="152" cy="74" rx="29" ry="35" transform="rotate(-12 152 74)" fill="url(#bm-stone)" strokeWidth="1.2" />
              <circle cx="118" cy="56" r="15" fill="url(#bm-stone)" strokeWidth="1.2" />
              <path d="M140,104 C141,114 141,122 136,130 C122,140 114,160 113,190 C112,240 112,280 118,318 C106,346 98,372 104,400 C110,440 118,470 120,510 C122,560 126,600 128,644 L130,656 C150,660 170,660 186,656 C174,648 162,640 158,630 C156,590 158,560 164,530 C170,500 176,470 178,440 C180,425 182,418 186,410 C230,396 264,356 262,316 C260,272 226,246 192,238 C206,228 208,192 188,170 C178,158 170,150 168,142 C164,128 162,118 160,108 Z"
                fill="url(#bm-stone)" strokeWidth="1.2" strokeLinejoin="round" />
            </g>
            <circle cx="224" cy="322" r="58" fill="url(#bm-glow)" stroke="none" />
            <path d="M132,150 C124,200 126,250 140,290" fill="none" strokeWidth="1" strokeLinecap="round" opacity=".55" />
            <path d="M140,290 C152,330 170,360 196,376 C204,381 214,382 222,378" fill="none" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M150,452 C146,520 146,580 150,640" fill="none" strokeWidth=".9" opacity=".35" />
          </g>

          {/* 40-week scale */}
          <g>
            <line x1="310" y1="30" x2="310" y2="290" stroke="hsl(var(--border))" strokeWidth=".8" />
            {Array.from({ length: 41 }, (_, i) => (
              <line key={i} x1="310" x2={i % 5 === 0 ? 305 : 307} y1={scaleY(i)} y2={scaleY(i)} stroke="hsl(var(--muted-foreground) / .5)" strokeWidth=".7" />
            ))}
            <line x1="310" y1="30" x2="310" y2={scaleY(week)} stroke="hsl(var(--primary))" strokeWidth="1.6" />
            <circle cx="310" cy={scaleY(week)} r="3.2" fill="hsl(var(--primary))" />
            <text x="301" y="34" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="hsl(var(--muted-foreground))">1</text>
            <text x="301" y="294" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="hsl(var(--muted-foreground))">40</text>
          </g>
        </svg>

      </div>

      <DetailsLink to="/dashboard/stage" />
    </section>
  );
}
