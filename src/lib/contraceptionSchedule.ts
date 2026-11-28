// Contraception methods other than the daily pill: the dates she enters
// from her clinic / pack (IUD check and replacement, implant end date,
// next injection, ring and patch change days), what the method card shows
// and the rows Home's Today list gets when a change is due.
//
// Pure (no React, no storage) so it is unit-tested.
//
// Product rules (decided 2026-11-28, conservative):
// - Every date comes from her: the app never works out how long an IUD or
//   implant lasts (that depends on the device and her clinic) or when the
//   next injection is (12 or 13 weeks depending on the product).
// - Ring and patch: she enters the day the current ring / first patch of
//   this cycle went on. "Usual schedule" follows the pack leaflet's
//   3 weeks on, 1 week off (ring: in day 1, out day 22, new ring day 29;
//   patch: new patch day 1, 8 and 15, off day 22, new patch day 29).
//   Anyone on another schedule picks "My own schedule" and enters the next
//   change date herself; the app then only reminds her of that date.
// - Rows say what is due and when; no advice beyond "check with your
//   clinic" when a date has passed.
// - Calendar days are plain YYYY-MM-DD strings with UTC math (no
//   clock-change drift).

export type ContraceptionMethodId = 'pill' | 'patch' | 'ring' | 'injection' | 'implant' | 'iud-hormonal' | 'iud-copper';

export const METHOD_LABELS: Record<ContraceptionMethodId, string> = {
  pill: 'Birth control pill',
  patch: 'Patch',
  ring: 'Vaginal ring',
  injection: 'Injection',
  implant: 'Implant',
  'iud-hormonal': 'Hormonal IUD',
  'iud-copper': 'Copper IUD',
};

export function isMethodId(v: unknown): v is ContraceptionMethodId {
  return typeof v === 'string' && v in METHOD_LABELS;
}

export interface MethodDates {
  /** IUD / implant: the day it was put in. */
  fitted?: string | null;
  /** IUD: the follow-up check her clinic booked. */
  check?: string | null;
  /** IUD / implant: replace (or remove) by, from her clinic card. */
  replace?: string | null;
  /** Injection: the last injection. */
  last?: string | null;
  /** Injection: the next injection date her clinic gave her. */
  next?: string | null;
  /** Ring / patch: day 1 of the current cycle (ring in / first patch on). */
  cycleStart?: string | null;
  /** Ring / patch: 'usual' = 3 weeks on, 1 week off; 'own' = she sets the next change. */
  schedule?: 'usual' | 'own';
  /** Ring / patch on her own schedule: the next change date. */
  nextChange?: string | null;
}

/** Saved per method, so switching methods never shows another method's dates. */
export type MethodDatesByMethod = Partial<Record<ContraceptionMethodId, MethodDates>>;

export const METHOD_DATES_KEY = (userId: string) => `contraception:${userId}:methodDates`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDateStr(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const DATE_FIELDS = ['fitted', 'check', 'replace', 'last', 'next', 'cycleStart', 'nextChange'] as const;

/** Anything from storage -> clean dates per method (broken fields dropped). */
export function parseMethodDates(raw: unknown): MethodDatesByMethod {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const out: MethodDatesByMethod = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!isMethodId(k) || !val || typeof val !== 'object') continue;
    const o = val as Record<string, unknown>;
    const clean: MethodDates = {};
    for (const f of DATE_FIELDS) if (isDateStr(o[f])) clean[f] = o[f] as string;
    if (o.schedule === 'own' || o.schedule === 'usual') clean.schedule = o.schedule;
    out[k] = clean;
  }
  return out;
}

// ─── Calendar math ───

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Local calendar day of a Date (device time). */
export function localDay(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ─── Ring and patch ───

export type ChangeKind = 'ring-in' | 'ring-out' | 'patch-on' | 'patch-change' | 'patch-off';

const CHANGE_LABEL: Record<ChangeKind, string> = {
  'ring-in': 'New ring in',
  'ring-out': 'Ring out (ring-free week)',
  'patch-on': 'New patch on',
  'patch-change': 'Change your patch',
  'patch-off': 'Patch off (patch-free week)',
};

/** Usual 28-day schedule: cycle day -> change on that day. */
function usualChange(method: 'ring' | 'patch', cycleDay: number): ChangeKind | null {
  if (method === 'ring') return cycleDay === 1 ? 'ring-in' : cycleDay === 22 ? 'ring-out' : null;
  if (cycleDay === 1) return 'patch-on';
  if (cycleDay === 8 || cycleDay === 15) return 'patch-change';
  if (cycleDay === 22) return 'patch-off';
  return null;
}

export interface CycleState {
  /** 1..28, null before the start date. */
  cycleDay: number | null;
  /** The next change from today on (today's counts), with its date. */
  next: { kind: ChangeKind | 'change'; label: string; date: string; daysUntil: number } | null;
}

/** Where she is in the ring / patch cycle and the next change. */
export function ringPatchState(method: 'ring' | 'patch', d: MethodDates, today: string): CycleState {
  if (d.schedule === 'own') {
    if (!d.nextChange) return { cycleDay: null, next: null };
    const daysUntil = daysBetween(today, d.nextChange);
    const label = method === 'ring' ? 'Ring change' : 'Patch change';
    return { cycleDay: null, next: { kind: 'change', label, date: d.nextChange, daysUntil } };
  }
  if (!d.cycleStart) return { cycleDay: null, next: null };
  const since = daysBetween(d.cycleStart, today);
  if (since < 0) {
    const kind: ChangeKind = method === 'ring' ? 'ring-in' : 'patch-on';
    return { cycleDay: null, next: { kind, label: CHANGE_LABEL[kind], date: d.cycleStart, daysUntil: -since } };
  }
  const cycleDay = (since % 28) + 1;
  for (let ahead = 0; ahead <= 28; ahead++) {
    const day = ((cycleDay - 1 + ahead) % 28) + 1;
    // Day 1 of the very first cycle is the day she started: already done.
    if (since + ahead === 0) continue;
    const kind = usualChange(method, day);
    if (kind) return { cycleDay, next: { kind, label: CHANGE_LABEL[kind], date: addDays(today, ahead), daysUntil: ahead } };
  }
  return { cycleDay, next: null };
}

// ─── Today rows ───

export interface ContraceptionRow {
  id: string;
  /** One line, at most 60 characters. */
  label: string;
  /** true = due today / overdue (ranked with the stage tasks); false = a heads-up. */
  urgent: boolean;
}

/** IUD / implant: replacement within this many days shows a heads-up. */
export const REPLACE_HEADS_UP_DAYS = 30;
/** Injection: the next one within this many days shows a heads-up. */
export const INJECTION_HEADS_UP_DAYS = 7;
/** An injection / own-schedule change this many days overdue stops showing (the date is likely stale). */
export const STALE_AFTER_DAYS = 28;

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function whenText(today: string, date: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 7) {
    const [y, m, d] = date.split('-').map(Number);
    return `on ${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
  }
  return `in ${n} days`;
}

/** Short day for row text: "3 Dec". */
export function shortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Rows for Home's Today list from the dates she entered for her current method. */
export function contraceptionRows(method: ContraceptionMethodId | null, d: MethodDates | undefined, now: Date): ContraceptionRow[] {
  if (!method || method === 'pill' || !d) return [];
  const today = localDay(now);
  const rows: ContraceptionRow[] = [];

  if (method === 'ring' || method === 'patch') {
    const st = ringPatchState(method, d, today);
    const n = st.next;
    if (n && n.daysUntil >= 0 && n.daysUntil <= 1) {
      rows.push({ id: 'method-change', label: `${n.label} ${n.daysUntil === 0 ? 'today' : 'tomorrow'}`, urgent: n.daysUntil === 0 });
    } else if (n && n.kind === 'change' && n.daysUntil < 0 && n.daysUntil >= -STALE_AFTER_DAYS) {
      rows.push({ id: 'method-change', label: `${n.label} was due ${shortDay(n.date)}: update the date`, urgent: true });
    }
    return rows;
  }

  if (method === 'injection' && d.next) {
    const n = daysBetween(today, d.next);
    if (n < 0 && n >= -STALE_AFTER_DAYS) rows.push({ id: 'method-injection', label: `Injection was due ${shortDay(d.next)}: check with your clinic`, urgent: true });
    else if (n === 0) rows.push({ id: 'method-injection', label: 'Contraceptive injection due today', urgent: true });
    else if (n > 0 && n <= INJECTION_HEADS_UP_DAYS) rows.push({ id: 'method-injection', label: `Contraceptive injection due ${whenText(today, d.next)}`, urgent: false });
    return rows;
  }

  // IUD and implant.
  const name = method === 'implant' ? 'Implant' : 'IUD';
  if (method !== 'implant' && d.check) {
    const n = daysBetween(today, d.check);
    if (n >= 0 && n <= 7) rows.push({ id: 'method-check', label: `IUD check ${whenText(today, d.check)}`, urgent: n === 0 });
  }
  if (d.replace) {
    const n = daysBetween(today, d.replace);
    if (n < 0) rows.push({ id: 'method-replace', label: `${name} replacement date passed: check with your clinic`, urgent: true });
    else if (n <= REPLACE_HEADS_UP_DAYS) {
      rows.push({ id: 'method-replace', label: `${name} replacement due ${n === 0 ? 'today' : n <= 7 ? whenText(today, d.replace) : `on ${shortDay(d.replace)}`}: book a visit`, urgent: n <= 7 });
    }
  }
  return rows;
}

/** One-line summary lines for the visit prep sheet (only the dates she set). */
export function methodSummaryLines(method: ContraceptionMethodId | null, d: MethodDates | undefined, now: Date): string[] {
  if (!method) return [];
  const lines = [`Method: ${METHOD_LABELS[method]}`];
  if (!d) return lines;
  const today = localDay(now);
  const put = (label: string, date: string | null | undefined) => { if (date) lines.push(`${label}: ${shortDay(date)} ${date.slice(0, 4)}`); };
  if (method === 'ring' || method === 'patch') {
    if (d.schedule === 'own') put('Next change', d.nextChange);
    else {
      const st = ringPatchState(method, d, today);
      put('Current cycle started', d.cycleStart);
      if (st.next) put(`Next: ${st.next.label}`, st.next.date);
    }
  } else if (method === 'injection') {
    put('Last injection', d.last);
    put('Next injection', d.next);
  } else if (method !== 'pill') {
    put('Put in', d.fitted);
    if (method !== 'implant') put('Check', d.check);
    put('Replace by', d.replace);
  }
  return lines;
}
