// "Last checked X months ago" notes for a few tests that are commonly
// looked at again (Records page, and the visit prep sheet). Pure, so the
// wording and the date arithmetic are unit-tested.
//
// Wording rule: statements of fact only (which test, when it was last
// measured, what the report said about it then) plus "ask your doctor".
// No advice and no recheck interval of our own. The one interval quoted is
// cited from the research library: FIGO 2025 (PMID 41031541) says pregnant
// women are screened for anaemia at booking and again at 28 weeks.
//
// MIN_MONTHS_SINCE is a display threshold (so a test done last month does
// not show up), not a recommendation; the note never says a test is "due".

import { formatLabDay } from './health-trends';
import { monthsBetween } from './monthsBetween';

export interface RecheckRow {
  title: string;
  value?: string | number | null;
  status: string | null;
  date_recorded: string | null;
  data_type?: string | null;
}

export type RecheckReason = 'outside-range' | 'borderline' | 'pregnancy-thyroid' | 'pregnancy-28-weeks';

export interface RecheckHint {
  key: 'ferritin' | 'haemoglobin' | 'tsh' | 'vitamin-d';
  /** Test name as her latest report spells it. */
  name: string;
  /** yyyy-mm-dd of the latest reading. */
  lastDate: string;
  monthsAgo: number;
  reason: RecheckReason;
  text: string;
  /** Set when the note quotes the research library. */
  source?: { label: string; pmid: string };
}

export interface RecheckContext {
  stage?: string | null;
  /** Estimated due date (pregnancy only). */
  dueDate?: Date | null;
  now?: Date;
}

export const MIN_MONTHS_SINCE = 3;
export const PREGNANCY_ANAEMIA_SOURCE = { label: 'FIGO guidance, 2025', pmid: '41031541' };
const OUT = new Set(['abnormal', 'critical']);

// Order matters: HbA1c must not count as haemoglobin.
const TESTS: Array<[RecheckHint['key'], RegExp]> = [
  ['ferritin', /\bferritin\b/],
  ['tsh', /\b(tsh|thyrotropin|thyroid[\s-]+stimulating)\b/],
  ['vitamin-d', /\b(vit(?:amin)?\.?\s*d[23]?|25[\s-]*\(?oh\)?\s*d?)(?![a-z])/],
  ['haemoglobin', /^(?!.*a1c)(?!.*glyc).*\b(ha?emoglobin|hgb|hb)\b/],
];

export function recheckKey(title: string): RecheckHint['key'] | null {
  const s = title.toLowerCase().replace(/[_]+/g, ' ').trim();
  for (const [key, re] of TESTS) if (re.test(s)) return key;
  return null;
}

const ymd = (raw: string) => /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] ?? null;
const localDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const monthsText = (n: number) => (n === 1 ? '1 month ago' : `${n} months ago`);

/**
 * One note per test (the latest reading wins), most recent reason first:
 * pregnancy notes, then results that were outside the range, then
 * borderline ones. Tests last measured under MIN_MONTHS_SINCE ago are left
 * out, except the cited 28-week anaemia check.
 */
export function recheckHints(rows: RecheckRow[], ctx: RecheckContext = {}): RecheckHint[] {
  const now = ctx.now ?? new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const latest = new Map<RecheckHint['key'], { row: RecheckRow; day: string }>();
  for (const r of rows) {
    if (r.data_type && r.data_type !== 'lab_result') continue;
    if (!r.title || !r.date_recorded) continue;
    const key = recheckKey(r.title);
    const day = ymd(String(r.date_recorded));
    if (!key || !day || day > todayYmd) continue;
    const prev = latest.get(key);
    if (!prev || day > prev.day) latest.set(key, { row: r, day });
  }

  const pregnant = ctx.stage === 'pregnancy' && ctx.dueDate instanceof Date && !Number.isNaN(ctx.dueDate.getTime());
  const start = pregnant ? new Date(ctx.dueDate!.getFullYear(), ctx.dueDate!.getMonth(), ctx.dueDate!.getDate() - 280) : null;
  const week28 = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 28 * 7) : null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const out: RecheckHint[] = [];
  for (const [key, { row, day }] of latest) {
    const when = localDate(day);
    const monthsAgo = monthsBetween(when, now);
    const name = row.title.trim();
    const head = `${name}: last checked ${monthsText(monthsAgo)} (${formatLabDay(day)}).`;
    const ask = 'Ask your doctor whether it should be checked again.';
    const status = (row.status ?? '').toLowerCase();

    // Cited: a blood count again at 28 weeks; her last one is from before then.
    if (key === 'haemoglobin' && week28 && today >= week28 && when < week28) {
      out.push({
        key, name, lastDate: day, monthsAgo, reason: 'pregnancy-28-weeks',
        text: `${head} FIGO guidance (2025) describes an anaemia check at the first pregnancy visit and again at 28 weeks. ${ask}`,
        source: PREGNANCY_ANAEMIA_SOURCE,
      });
      continue;
    }
    if (monthsAgo < MIN_MONTHS_SINCE) continue;
    if (key === 'tsh' && pregnant && start) {
      const before = when < start;
      out.push({
        key, name, lastDate: day, monthsAgo, reason: 'pregnancy-thyroid',
        text: `${head}${before ? ' That was before this pregnancy.' : ''}${OUT.has(status) ? ' It was outside the lab\'s range then.' : ''} ${ask}`,
      });
      continue;
    }
    if (OUT.has(status)) {
      out.push({ key, name, lastDate: day, monthsAgo, reason: 'outside-range', text: `${head} It was outside the lab's range then. ${ask}` });
    } else if (status === 'borderline') {
      out.push({ key, name, lastDate: day, monthsAgo, reason: 'borderline', text: `${head} It was marked borderline then. ${ask}` });
    }
  }
  const order: Record<RecheckReason, number> = { 'pregnancy-28-weeks': 0, 'pregnancy-thyroid': 1, 'outside-range': 2, borderline: 3 };
  return out.sort((a, b) => order[a.reason] - order[b.reason] || a.lastDate.localeCompare(b.lastDate));
}
