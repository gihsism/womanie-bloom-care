// Personal ovulation detection.
//
// The cycle prediction used to assume ovulation is always 14 days before
// the next period. Real luteal phases run 10–16 days and are fairly stable
// for one woman, so once we can see when she actually ovulated in past
// cycles we can learn HER luteal length and predict both the fertile
// window and the next period from it.
//
// Signals (all already logged in daily_health_signals):
//   - LH test       notes "LH test: positive"   → ovulation ≈ first positive + 1 day
//   - BBT           notes "BBT: 36.6°C"         → "3 over 6" thermal shift; ovulation = day before the rise
//   - Cervical mucus discharge = 'ewcm'          → last egg-white day ("peak day") ≈ ovulation
//   - Progesterone lab (mid-luteal ≥ 3 ng/mL / ≥ 10 nmol/L) → ovulation happened ≈ 7 days before the draw
//
// LH and BBT are precise enough to learn from; mucus and progesterone are
// rougher and only used to show "probably ovulated around …".

export type OvulationMethod = 'lh+bbt' | 'lh' | 'bbt' | 'mucus' | 'progesterone';

export interface OvulationEstimate {
  date: Date;
  method: OvulationMethod;
  confidence: 'high' | 'medium' | 'low';
}

export interface SignalLike {
  notes?: string | null;
  discharge?: string | null;
}

export interface ProgesteroneLab {
  value: number;
  unit: string | null;
  dateRecorded: string | null;
}

const DAY = 86400000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffD = (a: Date, b: Date) => Math.round((dayStart(a).getTime() - dayStart(b).getTime()) / DAY);
const parseYmd = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

export function parseLH(notes: string | null | undefined): 'positive' | 'negative' | null {
  const m = (notes ?? '').match(/LH test:\s*(positive|negative)/i);
  return m ? (m[1].toLowerCase() as 'positive' | 'negative') : null;
}

/** BBT from a note, always returned in °C (unit guessed from range when missing). */
export function parseBbtC(notes: string | null | undefined): number | null {
  const m = (notes ?? '').match(/BBT:\s*(\d+\.?\d*)\s*°?\s*([CF])?/i);
  if (!m) return null;
  const raw = parseFloat(m[1]);
  if (!Number.isFinite(raw)) return null;
  const unit = (m[2] || '').toUpperCase();
  const c = unit === 'C' || (!unit && raw < 50) ? raw : ((raw - 32) * 5) / 9;
  return c >= 34.5 && c <= 38.5 ? c : null;
}

/** Mid-luteal progesterone that confirms ovulation (≥ 3 ng/mL ≈ 9.5 nmol/L). */
export function progesteroneConfirmsOvulation(lab: ProgesteroneLab): boolean {
  const u = (lab.unit ?? '').toLowerCase();
  const ngml = u.includes('nmol') ? lab.value / 3.18 : lab.value;
  return ngml >= 3;
}

/**
 * Find the ovulation day between `from` (cycle day 1) and `to` (inclusive:
 * the day before the next period, or today for the running cycle).
 * Returns null when nothing in the logs points at a day.
 */
export function detectOvulation(
  signals: Record<string, SignalLike>,
  from: Date,
  to: Date,
  progesterone?: ProgesteroneLab | null,
): OvulationEstimate | null {
  const start = dayStart(from);
  const end = dayStart(to);
  const days = diffD(end, start) + 1;
  if (days < 1) return null;
  // Ovulation before cycle day 7 is not physiologically plausible enough
  // to trust a single signal (LH tests during the period are noise).
  const earliest = 6; // index → cycle day 7

  let lhFirst: number | null = null;
  let ewcmLast: number | null = null;
  const temps: { i: number; c: number }[] = [];
  for (let i = 0; i < days; i++) {
    const s = signals[ymd(addD(start, i))];
    if (!s) continue;
    if (i >= earliest && lhFirst === null && parseLH(s.notes) === 'positive') lhFirst = i;
    if (i >= earliest - 1 && s.discharge === 'ewcm') ewcmLast = i;
    const c = parseBbtC(s.notes);
    if (c !== null) temps.push({ i, c });
  }

  // "3 over 6": three consecutive readings above the highest of the six
  // before them, the third at least 0.15 °C above it. Ovulation = the day
  // before the first high reading.
  let bbtOv: number | null = null;
  for (let k = 6; k + 2 < temps.length; k++) {
    const six = temps.slice(k - 6, k);
    if (temps[k].i - six[0].i > 12) continue; // too many gaps to call it
    const cover = Math.max(...six.map(t => t.c));
    const [a, b, c] = [temps[k], temps[k + 1], temps[k + 2]];
    if (c.i - a.i > 4) continue;
    if (a.c > cover && b.c > cover && c.c >= cover + 0.15) {
      const ov = a.i - 1;
      if (ov >= earliest) { bbtOv = ov; break; }
    }
  }

  const lhOv = lhFirst !== null ? lhFirst + 1 : null; // may be tomorrow for a positive test today
  const at = (i: number) => addD(start, i);

  if (lhOv !== null && bbtOv !== null) {
    if (Math.abs(lhOv - bbtOv) <= 2) return { date: at(lhOv), method: 'lh+bbt', confidence: 'high' };
    // They disagree: the temperature rise is the one that confirms it happened.
    return { date: at(bbtOv), method: 'bbt', confidence: 'medium' };
  }
  if (lhOv !== null) return { date: at(lhOv), method: 'lh', confidence: 'medium' };
  if (bbtOv !== null) return { date: at(bbtOv), method: 'bbt', confidence: 'medium' };
  if (ewcmLast !== null && ewcmLast < days - 1) return { date: at(ewcmLast), method: 'mucus', confidence: 'low' };

  if (progesterone?.dateRecorded && progesteroneConfirmsOvulation(progesterone)) {
    const drawn = parseYmd(progesterone.dateRecorded);
    const i = diffD(drawn, start) - 7;
    if (diffD(drawn, start) >= 0 && diffD(drawn, end) <= 0 && i >= earliest) {
      return { date: at(i), method: 'progesterone', confidence: 'low' };
    }
  }
  return null;
}

export interface LearnedCycle {
  start: Date;
  nextStart: Date;
  ovulation: OvulationEstimate;
  luteal: number;
}

export interface LutealModel {
  lutealLength: number;
  source: 'personal' | 'default';
  cycles: LearnedCycle[]; // the completed cycles with a detected ovulation
}

const DEFAULT_LUTEAL = 14;

/**
 * Learn the luteal length from completed cycles. `periodStarts` may be in
 * any order (ISO yyyy-mm-dd). Only LH / BBT detections are precise enough
 * to learn from; the median resists one odd cycle.
 */
export function learnLuteal(
  periodStarts: string[],
  signals: Record<string, SignalLike>,
  progesterone?: ProgesteroneLab | null,
): LutealModel {
  const starts = [...new Set(periodStarts.map(s => s.slice(0, 10)))].sort().map(parseYmd);
  const cycles: LearnedCycle[] = [];
  for (let i = 0; i + 1 < starts.length; i++) {
    const len = diffD(starts[i + 1], starts[i]);
    if (len < 18 || len > 60) continue;
    const ov = detectOvulation(signals, starts[i], addD(starts[i + 1], -1), progesterone);
    if (!ov) continue;
    const luteal = diffD(starts[i + 1], ov.date);
    if (luteal < 8 || luteal > 18) continue;
    cycles.push({ start: starts[i], nextStart: starts[i + 1], ovulation: ov, luteal });
  }
  const precise = cycles.filter(c => c.ovulation.confidence !== 'low').map(c => c.luteal).sort((a, b) => a - b);
  if (precise.length === 0) return { lutealLength: DEFAULT_LUTEAL, source: 'default', cycles };
  const mid = Math.floor(precise.length / 2);
  const median = precise.length % 2 ? precise[mid] : (precise[mid - 1] + precise[mid]) / 2;
  return { lutealLength: Math.round(Math.max(10, Math.min(16, median))), source: 'personal', cycles };
}

export const METHOD_TEXT: Record<OvulationMethod, string> = {
  'lh+bbt': 'LH test + temperature rise',
  lh: 'positive LH test',
  bbt: 'temperature rise',
  mucus: 'egg-white discharge',
  progesterone: 'progesterone blood test',
};
