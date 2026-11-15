import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLabResults } from '@/hooks/useLabResults';
import { useLifeEvents } from '@/hooks/useLifeEvents';
import { onHealthDataChange } from '@/lib/data-events';
import { pickFlaggedLab, medsToday, kicksToday, weekWord, fmtGrams } from '@/lib/bodyMap';
import { getWeekData } from './PregnancyTracker';

// Version 8 "body map" hero for pregnancy: a sculpted figure on the
// gallery wall, each hotspot labelled with one live fact (next visit,
// the blood value that needs attention, today's medicines, the baby).
// Every label is a button to the place where that fact lives.
//
// Drawn in a fixed 320 x 520 coordinate box; labels are positioned in
// percentages of that box so the composition scales with the screen.

const W = 320;
const H = 520;
const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

interface Appt { scheduled_at: string; doctor_name?: string | null; doctor_title?: string | null }

export default function PregnancyBodyMap({ dueDate, name }: { dueDate: Date; name?: string | null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { labs } = useLabResults();
  const doses = useLifeEvents<{ medication_id?: string; name?: string }>('med_dose', { limit: 60 });
  const kicks = useLifeEvents<{ count?: number }>('kick_session', { limit: 10 });
  const [meds, setMeds] = useState<{ id: string; name: string }[]>([]);
  const [appt, setAppt] = useState<Appt | null>(null);
  const [apptLoaded, setApptLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/me/appointments?upcoming=true');
        const p = r.ok ? await r.json() : { appointments: [] };
        if (alive) setAppt(((p.appointments ?? []) as Appt[])[0] ?? null);
      } catch { /* hero stays usable without it */ }
      if (alive) setApptLoaded(true);
      const { data } = await db.from('medications').select('id, name').eq('user_id', user.id).eq('active', true);
      if (alive) setMeds((data as { id: string; name: string }[] | null) ?? []);
    };
    load();
    const off = onHealthDataChange(load);
    return () => { alive = false; off(); };
  }, [user]);

  const now = new Date();
  const conception = dueDate.getTime() - 280 * 86400000;
  const week = Math.min(42, Math.max(0, Math.floor((now.getTime() - conception) / (7 * 86400000))));
  const daysLeft = Math.max(0, differenceInDays(dueDate, now));
  const wk = getWeekData(Math.max(4, Math.min(40, week)));
  const grams = wk.weightG?.median ?? null;
  const size = grams != null ? fmtGrams(grams) : null;
  const flagged = pickFlaggedLab(labs);
  const med = medsToday(meds, doses.events, now);
  const kick = kicksToday(kicks.events, now);

  const go = (target: string) => {
    if (target.startsWith('/')) { navigate(target); return; }
    const el = document.getElementById(target.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/40', 'rounded-xl');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40', 'rounded-xl'), 1600);
    }
  };

  const first = name?.trim().split(/\s+/)[0];
  const scaleY = (w: number) => 30 + (Math.min(40, w) / 40) * 260;

  return (
    <section className="mb-6" aria-label="Your pregnancy at a glance">
      <p className="label-mono">{first ? `${first} · ` : ''}{format(now, 'EEE d MMM')}</p>
      <h2 className="font-display text-[38px] leading-[1.02] font-normal mt-1">
        Week {weekWord(week)}<br /><span className="text-muted-foreground">of forty</span>
      </h2>

      <div className="relative mx-auto mt-3 w-full max-w-[380px]" style={{ aspectRatio: `${W} / ${H}` }}>
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

          {/* leaders */}
          <g fill="none" strokeWidth="1">
            <path d="M171,22 H116 M116,17 v10" stroke="#1A1A19" />
            <path d={`M193.5,118 H116 M116,113 v10`} stroke={flagged ? 'hsl(var(--destructive))' : '#1A1A19'} />
            <path d="M245,218 L270,250 V322 M265,322 h10" stroke="hsl(var(--primary))" />
          </g>
          {/* hotspots */}
          <g>
            <circle cx="171" cy="22" r="3.5" fill="#1A1A19" /><circle cx="171" cy="22" r="8" fill="none" stroke="#1A1A19" strokeWidth=".8" />
            <circle cx="193.5" cy="118" r="4" fill={flagged ? 'hsl(var(--destructive))' : '#1A1A19'} />
            <circle cx="193.5" cy="118" r="9" fill="none" stroke={flagged ? 'hsl(var(--destructive))' : '#1A1A19'} strokeWidth=".9" />
            {flagged && <circle cx="193.5" cy="118" r="14" fill="none" stroke="hsl(var(--destructive))" strokeWidth=".6" opacity=".45" />}
            <circle cx="245" cy="218" r="4.5" fill="hsl(var(--primary))" />
            <circle cx="245" cy="218" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth=".9" />
            <circle cx="245" cy="218" r="16" fill="none" stroke="hsl(var(--primary))" strokeWidth=".6" opacity=".45" />
          </g>
          {/* 40-week scale */}
          <g>
            <line x1="310" y1="30" x2="310" y2="290" stroke="hsl(var(--border))" strokeWidth=".8" />
            {Array.from({ length: 41 }, (_, i) => (
              <line key={i} x1="310" x2={i % 5 === 0 ? 305 : 307} y1={scaleY(i)} y2={scaleY(i)} stroke="hsl(var(--muted-foreground) / .5)" strokeWidth=".7" />
            ))}
            <line x1="310" y1="30" x2="310" y2={scaleY(week)} stroke="hsl(var(--primary))" strokeWidth="1.6" />
            <circle cx="310" cy={scaleY(week)} r="3.2" fill="hsl(var(--primary))" />
            <text x="301" y={scaleY(week) + 4} textAnchor="end" fontFamily="DM Mono, monospace" fontSize="10.5" fill="hsl(var(--primary))">{week}</text>
            <text x="301" y="34" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="hsl(var(--muted-foreground))">1</text>
            <text x="301" y="294" textAnchor="end" fontFamily="DM Mono, monospace" fontSize="9.5" fill="hsl(var(--muted-foreground))">40</text>
          </g>
        </svg>

        {/* Head · next visit */}
        <button type="button" onClick={() => go('/dashboard/appointments')}
          className="absolute w-[35%] text-right leading-tight" style={pct(0, 0)}>
          <span className="label-mono block">Head · next</span>
          {appt ? (
            <>
              <span className="block text-[15px] font-medium mt-1">Check-up</span>
              <span className="block text-[13px] text-muted-foreground mt-0.5">
                {(() => { const d = differenceInDays(new Date(appt.scheduled_at), now); return d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`; })()}
                <br />{format(new Date(appt.scheduled_at), 'EEE d MMM, HH:mm')}
              </span>
            </>
          ) : (
            <>
              <span className="block text-[15px] font-medium mt-1">{apptLoaded ? 'No visit booked' : '…'}</span>
              <span className="block text-[13px] text-primary mt-0.5">Add a visit →</span>
            </>
          )}
        </button>

        {/* Blood · flagged result */}
        <button type="button" onClick={() => go('/dashboard/medical-history')}
          className="absolute w-[35%] text-right leading-tight" style={pct(0, 82)}>
          {flagged ? (
            <>
              <span className="label-mono block !text-destructive">Blood · {flagged.critical ? 'needs a look' : 'outside range'}</span>
              <span className="block text-[15px] font-medium mt-1 truncate">{flagged.title}</span>
              <span className="block font-display text-[30px] leading-none mt-0.5 text-destructive">
                {flagged.value}<small className="font-sans text-xs text-muted-foreground ml-1">{flagged.unit}</small>
              </span>
              <span className="block text-[13px] text-muted-foreground mt-1">
                <b className="font-medium text-destructive">{flagged.direction === 'low' ? 'Low.' : flagged.direction === 'high' ? 'High.' : 'Check.'}</b>
                {flagged.range && <span className="whitespace-nowrap"> Normal {flagged.range}</span>}
              </span>
            </>
          ) : (
            <>
              <span className="label-mono block">Blood</span>
              <span className="block text-[15px] font-medium mt-1">{labs.length ? 'All in range' : 'No results yet'}</span>
              <span className="block text-[13px] text-muted-foreground mt-0.5">{labs.length ? `${labs.length} values read` : 'Upload a lab report'}</span>
            </>
          )}
        </button>

        {/* Medicines today: a plain caption, not pinned to the body (her 2026-11-15 note: "why hand at all?") */}
        <button type="button" onClick={() => go('#medicines')}
          className="absolute w-[35%] text-right leading-tight border-t border-border pt-2" style={pct(0, 245)}>
          <span className="label-mono block">Medicines{med.lastAt ? ` · ${format(new Date(med.lastAt), 'HH:mm')}` : ''}</span>
          {med.total === 0 ? (
            <>
              <span className="block text-[15px] font-medium mt-1">No medicines</span>
              <span className="block text-[13px] text-primary mt-0.5">Add vitamins →</span>
            </>
          ) : med.takenToday >= med.total ? (
            <>
              <span className="block text-[15px] font-medium mt-1">All taken ✓</span>
              <span className="block text-[13px] text-muted-foreground mt-0.5">Today’s doses, done.</span>
            </>
          ) : (
            <>
              <span className="block text-[15px] font-medium mt-1">{med.takenToday} of {med.total} taken</span>
              <span className="block text-[13px] text-primary mt-0.5">Log a dose →</span>
            </>
          )}
        </button>

        {/* Belly · baby */}
        <button type="button" onClick={() => go(week >= 28 ? '#kick-counter' : '/dashboard')}
          className="absolute w-[38%] text-left leading-tight" style={pct(200, 334)}>
          <span className="label-mono block !text-primary">Belly · baby</span>
          {size && (
            <span className="block font-display text-[34px] leading-none mt-1">
              {size.value}<small className="font-sans text-xs text-muted-foreground ml-1">{size.unit}</small>
            </span>
          )}
          <span className="block text-[13px] text-muted-foreground mt-0.5">about a {wk.size.toLowerCase()}</span>
          {week >= 28 && (
            <>
              <span className="block h-px bg-border my-2.5" />
              <span className="label-mono block">Kicks today</span>
              {kick ? (
                <>
                  <span className="flex items-baseline gap-1.5 mt-1">
                    <span className="font-display text-[28px] leading-none text-primary">{kick.count}</span>
                    <span className="text-xs text-muted-foreground">of 10</span>
                  </span>
                  <span className="flex gap-[5px] mt-1.5" aria-hidden="true">
                    {Array.from({ length: 10 }, (_, i) => (
                      <span key={i} className={`h-[7px] w-[7px] rounded-full border border-primary ${i < kick.count ? 'bg-primary' : ''}`} />
                    ))}
                  </span>
                </>
              ) : (
                <span className="block text-[13px] text-primary mt-1">Start counting →</span>
              )}
            </>
          )}
        </button>
      </div>

      <div className="mt-2 flex items-start justify-between border-t border-foreground pt-2.5">
        <p className="text-[13px] leading-snug">
          {daysLeft > 0 ? <>{daysLeft} days remain. Due <b className="font-medium">{format(dueDate, 'd MMMM')}</b>.</> : <>Due date reached — <b className="font-medium">any day now</b>.</>}
          <br /><span className="text-muted-foreground">Touch any label to open it.</span>
        </p>
        <p className="label-mono text-right leading-relaxed">No. {week} / 40{first ? <><br />{first}</> : null}</p>
      </div>
    </section>
  );
}
