// Pure helpers for the version 8 "body map" hero on the dashboard: each
// hotspot on the figure shows one live fact. Kept free of React and the
// database so the rules are unit-tested.

export interface LabLike {
  title: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
}

export interface FlaggedLab {
  title: string;
  value: string;
  unit: string | null;
  range: string | null;
  direction: 'low' | 'high' | 'out';
  critical: boolean;
}

/** Parse "15-150", "15 – 150", "<5", ">30" into bounds. */
export function parseRange(range: string | null | undefined): { low: number | null; high: number | null } | null {
  if (!range) return null;
  const r = range.replace(/,/g, '.');
  const between = r.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const lt = r.match(/^\s*(?:<|≤|<=)\s*(\d+(?:\.\d+)?)/);
  if (lt) return { low: null, high: Number(lt[1]) };
  const gt = r.match(/^\s*(?:>|≥|>=)\s*(\d+(?:\.\d+)?)/);
  if (gt) return { low: Number(gt[1]), high: null };
  return null;
}

/** The one lab result worth putting on the figure: critical first, then abnormal. */
export function pickFlaggedLab(labs: LabLike[]): FlaggedLab | null {
  const rank = (s: string | null) => (s === 'critical' ? 0 : s === 'abnormal' ? 1 : 9);
  const flagged = labs.filter(l => rank(l.status) < 9 && l.value != null && String(l.value).trim() !== '');
  if (!flagged.length) return null;
  flagged.sort((a, b) => rank(a.status) - rank(b.status));
  const l = flagged[0];
  const num = Number(String(l.value).replace(',', '.'));
  const b = parseRange(l.reference_range);
  let direction: FlaggedLab['direction'] = 'out';
  if (b && Number.isFinite(num)) {
    if (b.low != null && num < b.low) direction = 'low';
    else if (b.high != null && num > b.high) direction = 'high';
  }
  return {
    title: l.title,
    value: String(l.value),
    unit: l.unit,
    range: l.reference_range,
    direction,
    critical: l.status === 'critical',
  };
}

const sameDay = (iso: string, now: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

export interface MedSummary {
  total: number; // active medicines
  takenToday: number; // distinct medicines with a dose logged today
  lastName: string | null;
  lastAt: string | null; // ISO of the latest dose today
}

export function medsToday(
  meds: { id: string; name: string }[],
  doses: { occurred_at: string; data: { medication_id?: string; name?: string } }[],
  now: Date,
): MedSummary {
  const today = doses.filter(d => sameDay(d.occurred_at, now)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const ids = new Set(meds.map(m => m.id));
  const taken = new Set(today.map(d => d.data?.medication_id).filter((id): id is string => !!id && ids.has(id)));
  const last = today[0];
  const lastName = last ? (meds.find(m => m.id === last.data?.medication_id)?.name ?? last.data?.name ?? null) : null;
  return { total: meds.length, takenToday: taken.size, lastName, lastAt: last?.occurred_at ?? null };
}

/** Latest finished kick-count session today, if any. */
export function kicksToday(
  sessions: { occurred_at: string; ended_at?: string | null; data: { count?: number } }[],
  now: Date,
): { count: number; minutes: number | null } | null {
  const today = sessions.filter(s => sameDay(s.occurred_at, now)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  if (!today.length) return null;
  const s = today[0];
  const minutes = s.ended_at ? Math.max(0, Math.round((Date.parse(s.ended_at) - Date.parse(s.occurred_at)) / 60000)) : null;
  return { count: Number(s.data?.count) || 0, minutes };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty'];

/** 30 -> "thirty", 27 -> "twenty-seven" (weeks of pregnancy, 0-42). */
export function weekWord(n: number): string {
  if (n < 0 || n > 49 || !Number.isInteger(n)) return String(n);
  if (n < 20) return WORDS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${TENS[t]}-${WORDS[u]}` : TENS[t];
}

/** Format grams as "780 g" or "1.4 kg". */
export function fmtGrams(g: number): { value: string; unit: string } {
  if (g < 1000) return { value: String(Math.round(g)), unit: 'g' };
  return { value: (g / 1000).toFixed(1), unit: 'kg' };
}

// ---- Baby (postpartum) body map ------------------------------------------

type Ev = { occurred_at: string; ended_at?: string | null; data: Record<string, unknown> };

export interface LastFeed {
  minutesAgo: number;
  method: string; // breast_l | breast_r | bottle | ...
  durationMin: number | null;
  ml: number | null;
  nextSide: 'left' | 'right' | null; // suggest the other breast after a breast feed
}

export function lastFeed(feeds: Ev[], now: Date): LastFeed | null {
  const past = feeds.filter(f => Date.parse(f.occurred_at) <= now.getTime()).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const f = past[0];
  if (!f) return null;
  const method = String(f.data?.method ?? '');
  const dur = f.ended_at ? Math.round((Date.parse(f.ended_at) - Date.parse(f.occurred_at)) / 60000) : null;
  const ml = Number(f.data?.ml);
  return {
    minutesAgo: Math.max(0, Math.round((now.getTime() - Date.parse(f.occurred_at)) / 60000)),
    method,
    durationMin: dur != null && dur > 0 && dur < 180 ? dur : null,
    ml: Number.isFinite(ml) && ml > 0 ? ml : null,
    nextSide: method === 'breast_l' ? 'right' : method === 'breast_r' ? 'left' : null,
  };
}

export function countToday(events: Ev[], now: Date): number {
  return events.filter(e => sameDay(e.occurred_at, now)).length;
}

export function nappiesToday(nappies: Ev[], now: Date): { wet: number; dirty: number } {
  let wet = 0; let dirty = 0;
  for (const n of nappies) {
    if (!sameDay(n.occurred_at, now)) continue;
    const t = n.data?.type;
    if (t === 'wet' || t === 'both') wet += 1;
    if (t === 'dirty' || t === 'both') dirty += 1;
  }
  return { wet, dirty };
}

/** Total finished sleep today in minutes (sleep that started today). */
export function sleepTodayMin(sleeps: Ev[], now: Date): number {
  return sleeps.reduce((s, e) => {
    if (!e.ended_at || !sameDay(e.occurred_at, now)) return s;
    const m = (Date.parse(e.ended_at) - Date.parse(e.occurred_at)) / 60000;
    return m > 0 && m < 16 * 60 ? s + m : s;
  }, 0);
}

/** "1h 20" / "42 min" for compact labels. */
export function fmtAgo(min: number): { value: string; unit: string } {
  if (min < 60) return { value: String(min), unit: 'min' };
  const h = Math.floor(min / 60); const m = min % 60;
  return { value: m ? `${h}h ${String(m).padStart(2, '0')}` : `${h}h`, unit: '' };
}

/** Day of life, birth day = day 1. */
export function dayOfLife(birthDate: string | null | undefined, now: Date): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - b.getTime()) / 86400000) + 1;
}
