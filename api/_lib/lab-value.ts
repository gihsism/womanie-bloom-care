// One parser for lab values and reference ranges, shared by the analysis
// pipeline (api/) and every screen that reads stored values (src/lib/labValue.ts
// re-exports it).
//
// Why: values are stored verbatim as the lab printed them (analyze-document
// rule C). Swiss/German labs print a decimal comma ("1,25") and use an
// apostrophe or a space between thousands ("1'250", "1 250"); English
// reports use "1,250" for twelve hundred and fifty. The old readers turned
// every comma into a point, so "1,250" became 1.25.
//
// Rules, in order:
//   1. An apostrophe or space between 3-digit groups is always a thousands
//      separator ("1'250", "12 500").
//   2. Both "." and "," present: the last one is the decimal mark.
//   3. A comma followed by anything other than exactly 3 digits is a decimal
//      comma ("0,5", "12,5", "1,25"). "0,125" is a decimal too.
//   4. "1,250" / "1.250" (one separator, exactly 3 digits after) is
//      genuinely ambiguous. The document's number style decides when known
//      (decimal-comma documents -> 1.25, point documents -> 1250); otherwise
//      the plausible range for that test decides; if that cannot decide
//      either, the value is flagged `check` instead of guessed silently.
//   5. A reading that is implausible for the test under the chosen reading
//      is flagged `check` too, never changed.
//
// Notation only: no unit conversion here (see normalize-unit.ts).

import { normalizeUnit } from './normalize-unit.js';

/** How a document writes decimals: 'comma' = "1,25", 'point' = "1.25". */
export type NumberStyle = 'comma' | 'point';

export type Comparator = '<' | '<=' | '>' | '>=';

export interface ParsedLabValue {
  raw: string;
  kind: 'number' | 'bound' | 'qualitative' | 'none';
  /** The number (for a bound such as "<5", the bound). */
  value: number | null;
  comparator: Comparator | null;
  qualitative: 'negative' | 'positive' | null;
  /** Ambiguous or implausible: show "check value", do not trust silently. */
  check: boolean;
  /** Both readings when ambiguous, e.g. [1.25, 1250]. */
  alternatives?: [number, number];
  reason?: string;
}

export interface ParsedLabRange {
  raw: string;
  low: number | null;
  high: number | null;
  /** Expected qualitative result ("negativ"). */
  qualitative: 'negative' | 'positive' | null;
  /** The text gave separate ranges by sex and we picked hers. */
  sexSpecific: boolean;
  check: boolean;
  reason?: string;
}

export interface LabParseContext {
  /** Document number style when known (stored or inferred). */
  style?: NumberStyle | null;
  /** Test title, used for the plausibility check. */
  title?: string | null;
  unit?: string | null;
  /** 'female' picks the female range from sex-specific ranges. */
  sex?: 'female' | 'male' | null;
}

// ------------------------------------------------------------ plausibility

interface Plausible { units: string[]; min: number; max: number }

// Wide "a real lab could print this" windows, not reference ranges. Unit
// keys are compared after normaliseUnitKey (micro -> u, lowercase).
const PLAUSIBLE: Array<{ id: string; match: RegExp; ranges: Plausible[] }> = [
  { id: 'ferritin', match: /^(serum\s+)?ferritin\b/i, ranges: [{ units: ['ug/l', 'ng/ml'], min: 1, max: 1000 }] },
  { id: 'tsh', match: /^(tsh|thyroid[\s-]+stimulating\s+hormone|thyreotropin)\b/i, ranges: [{ units: ['mu/l', 'miu/l', 'uiu/ml', 'uu/ml', 'mu/ml'], min: 0.01, max: 100 }] },
  { id: 'hemoglobin', match: /^(h(a)?emoglobin|h(ä|ae)moglobin|hb|hgb)(\s*\(.*\))?$/i, ranges: [
    { units: ['g/l'], min: 50, max: 200 },
    { units: ['g/dl'], min: 5, max: 20 },
    { units: ['mmol/l'], min: 3, max: 12.5 },
  ] },
  { id: 'vitamin-d', match: /vitamin\s*d|25[\s-]*(oh|hydroxy)|calcidiol/i, ranges: [
    { units: ['nmol/l'], min: 5, max: 400 },
    { units: ['ng/ml', 'ug/l'], min: 2, max: 160 },
  ] },
  { id: 'b12', match: /^(vitamin\s*)?b[\s-]?12\b|cobalamin/i, ranges: [
    { units: ['pmol/l'], min: 40, max: 1500 },
    { units: ['pg/ml', 'ng/l'], min: 50, max: 2000 },
  ] },
  { id: 'free-t4', match: /^(free\s*t4|ft4|free\s+thyroxine|freies\s+t4)\b/i, ranges: [
    { units: ['pmol/l'], min: 2, max: 100 },
    { units: ['ng/dl'], min: 0.1, max: 8 },
  ] },
  { id: 'hba1c', match: /^(hba1c|h(a|ä)?emoglobin\s+a1c|a1c|glycated)/i, ranges: [
    { units: ['%'], min: 3, max: 20 },
    { units: ['mmol/mol'], min: 10, max: 200 },
  ] },
  { id: 'amh', match: /^(amh|anti[\s-]+m(u|ü)ller)/i, ranges: [
    { units: ['ng/ml', 'ug/l'], min: 0.01, max: 30 },
    { units: ['pmol/l'], min: 0.05, max: 220 },
  ] },
  { id: 'glucose', match: /^(fasting\s+)?(glucose|glukose|blutzucker)\b/i, ranges: [
    { units: ['mmol/l'], min: 1, max: 40 },
    { units: ['mg/dl'], min: 15, max: 700 },
  ] },
  { id: 'platelets', match: /^(platelets?|thrombo[cz]yten|plt)\b/i, ranges: [
    { units: ['g/l', '10^9/l', '10*9/l', '/nl', '10^3/ul', 'x10^9/l'], min: 5, max: 1500 },
    { units: ['/ul'], min: 5000, max: 1500000 },
  ] },
  { id: 'leukocytes', match: /^(wbc|white\s+blood|leuko[cz]yten|leukocytes)\b/i, ranges: [
    { units: ['g/l', '10^9/l', '10*9/l', '/nl', '10^3/ul', 'x10^9/l'], min: 0.3, max: 150 },
    { units: ['/ul'], min: 300, max: 150000 },
  ] },
  { id: 'crp', match: /^(crp|c[\s-]reactive|c-reaktives)/i, ranges: [{ units: ['mg/l'], min: 0, max: 600 }] },
  { id: 'creatinine', match: /^(creatinine|kreatinin)\b/i, ranges: [
    { units: ['umol/l'], min: 10, max: 1500 },
    { units: ['mg/dl'], min: 0.1, max: 20 },
  ] },
  { id: 'estradiol', match: /^(estradiol|oestradiol|östradiol|e2)\b/i, ranges: [
    { units: ['pmol/l'], min: 10, max: 30000 },
    { units: ['pg/ml', 'ng/l'], min: 3, max: 8000 },
  ] },
];

export function normaliseUnitKey(unit: string | null | undefined): string {
  const n = normalizeUnit(unit ?? null) ?? '';
  return n.toLowerCase().replace(/\s+/g, '').replace(/[µμ]/g, 'u').replace(/×/g, 'x');
}

/** The plausibility window for a test (in its unit when known). */
export function plausibleWindow(title: string | null | undefined, unit?: string | null): { min: number; max: number } | null {
  const t = (title ?? '').trim();
  if (!t) return null;
  const entry = PLAUSIBLE.find(p => p.match.test(t));
  if (!entry) return null;
  const u = normaliseUnitKey(unit);
  if (u) {
    const hit = entry.ranges.find(r => r.units.includes(u));
    if (hit) return { min: hit.min, max: hit.max };
    return null; // a unit we do not know for this test: no opinion
  }
  // Unit unknown: any of its units.
  return {
    min: Math.min(...entry.ranges.map(r => r.min)),
    max: Math.max(...entry.ranges.map(r => r.max)),
  };
}

const inWindow = (n: number, w: { min: number; max: number } | null) => !w || (n >= w.min && n <= w.max);

// ------------------------------------------------------------ numbers

// A number as printed: thousands groups with apostrophe/space, or digits
// with "." / "," separators. Leading sign allowed.
const NUM_SRC = String.raw`[-−]?(?:\d{1,3}(?:['’ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*|[.,]\d+)`;
const NUM_RE = new RegExp(NUM_SRC);

interface NumberRead { value: number; check: boolean; alternatives?: [number, number]; reason?: string }

/** Interpret one printed number token (see the rules at the top). */
export function readNumber(token: string, ctx: LabParseContext = {}): NumberRead | null {
  let s = token.trim().replace(/−/g, '-');
  if (!s) return null;
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  // Rule 1: apostrophe / space thousands.
  s = s.replace(/(\d)['’ \u00a0\u202f](?=\d{3}\b)/g, '$1');
  const sign = (n: number) => (neg ? -n : n);
  const window = plausibleWindow(ctx.title, ctx.unit);
  const done = (n: number, extra?: Partial<NumberRead>): NumberRead | null => {
    if (!Number.isFinite(n)) return null;
    const v = sign(n);
    const r: NumberRead = { value: v, check: false, ...extra };
    if (!r.check && window && !inWindow(v, window)) {
      r.check = true;
      r.reason = r.reason ?? 'outside the usual range for this test';
    }
    return r;
  };

  if (/^\d+$/.test(s)) return done(Number(s));
  if (/^[.,]\d+$/.test(s)) return done(Number('0.' + s.slice(1)));

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // Rule 2: the last separator is the decimal mark.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    const intPart = s.slice(0, s.lastIndexOf(dec));
    if (!new RegExp(`^\\d{1,3}(\\${thou}\\d{3})*$`).test(intPart)) return null;
    return done(Number(intPart.split(thou).join('') + '.' + s.slice(s.lastIndexOf(dec) + 1)));
  }
  const sep = hasDot ? '.' : ',';
  const parts = s.split(sep);
  if (parts.some(p => p === '' || !/^\d+$/.test(p))) return null;
  if (parts.length > 2) {
    // "1,250,000" / "1.250.000": only thousands groups make sense.
    if (parts.slice(1).every(p => p.length === 3) && parts[0].length <= 3) return done(Number(parts.join('')));
    return null;
  }
  const [intPart, frac] = parts;
  const asDecimal = Number(`${intPart}.${frac}`);
  // Rule 3: not exactly 3 digits after, or a leading 0 -> decimal.
  if (frac.length !== 3 || /^0+$/.test(intPart) || intPart.length > 3) return done(asDecimal);
  // Rule 4: "1,250" / "1.250".
  const asThousands = Number(intPart + frac);
  const alternatives: [number, number] = [asDecimal, asThousands];
  // The separator agrees with the document's own decimal mark -> decimal.
  const docDecimal = ctx.style === 'comma' ? ',' : ctx.style === 'point' ? '.' : null;
  if (docDecimal) {
    const pick = sep === docDecimal ? asDecimal : asThousands;
    const other = pick === asDecimal ? asThousands : asDecimal;
    if (!inWindow(pick, window) && window && inWindow(other, window)) {
      return done(pick, { check: true, alternatives, reason: `could be ${fmtN(asDecimal)} or ${fmtN(asThousands)}` });
    }
    return done(pick);
  }
  // Style unknown. A point with 3 decimals is the international default
  // ("1.250" = 1.25) unless the test says otherwise.
  const decOk = inWindow(asDecimal, window);
  const thouOk = inWindow(asThousands, window);
  if (window && decOk !== thouOk) return done(decOk ? asDecimal : asThousands);
  if (sep === '.' && (!window || decOk)) return done(asDecimal);
  return done(asDecimal, { check: true, alternatives, reason: `could be ${fmtN(asDecimal)} or ${fmtN(asThousands)}` });
}

const fmtN = (n: number) => String(Math.round(n * 1e6) / 1e6);

// ------------------------------------------------------------ values

const NEG_WORDS = /^(negativ|negative|neg\.?|nicht\s+nachweisbar|nicht\s+nachgewiesen|not\s+detected|undetectable|non\s+d[ée]tect[ée]e?|n[ée]gatif|negativo|non\s+reattivo|nonreactive|non[\s-]reactive|nicht\s+reaktiv|kein\w*)\b/i;
const POS_WORDS = /^((schwach\s+|weakly\s+|faiblement\s+)?(positiv|positive|pos\.?|nachweisbar|nachgewiesen|detected|reaktiv|reactive|positif|positivo|reattivo))\b/i;

const COMPARATOR_RE = /^(<=|>=|=<|=>|≤|≥|<|>|unter|kleiner\s+als|kleiner|bis|max\.?|über|ueber|grösser\s+als|größer\s+als|groesser\s+als|mehr\s+als|less\s+than|greater\s+than|up\s+to|above|below|inf[ée]rieur\s+[àa]|sup[ée]rieur\s+[àa])\s*/i;

function comparatorOf(word: string): Comparator {
  const w = word.toLowerCase().replace(/\s+/g, ' ').trim();
  if (w === '<=' || w === '≤' || w === '=<' || w === 'bis' || w.startsWith('max') || w === 'up to') return '<=';
  if (w === '>=' || w === '≥' || w === '=>') return '>=';
  if (w === '<' || /^(unter|kleiner|less|below|inf)/.test(w)) return '<';
  return '>';
}

/** Parse a stored lab value ("1'250", "<5", "12,5 H", "negativ"). */
export function parseLabValue(raw: string | number | null | undefined, ctx: LabParseContext = {}): ParsedLabValue {
  const base = (s: string): ParsedLabValue => ({ raw: s, kind: 'none', value: null, comparator: null, qualitative: null, check: false });
  if (raw === null || raw === undefined) return base('');
  if (typeof raw === 'number') {
    const out = base(String(raw));
    if (!Number.isFinite(raw)) return out;
    return { ...out, kind: 'number', value: raw };
  }
  const text = String(raw).trim();
  const out = base(text);
  if (!text) return out;
  if (NEG_WORDS.test(text)) return { ...out, kind: 'qualitative', qualitative: 'negative' };
  if (POS_WORDS.test(text)) return { ...out, kind: 'qualitative', qualitative: 'positive' };

  let rest = text;
  let comparator: Comparator | null = null;
  const cm = rest.match(COMPARATOR_RE);
  if (cm && NUM_RE.test(rest.slice(cm[0].length))) {
    comparator = comparatorOf(cm[1]);
    rest = rest.slice(cm[0].length);
  }
  const m = rest.match(NUM_RE);
  if (!m) return out;
  const read = readNumber(m[0], ctx);
  if (!read) return { ...out, check: true, reason: 'number not readable' };
  return {
    ...out,
    kind: comparator ? 'bound' : 'number',
    value: read.value,
    comparator,
    check: read.check,
    ...(read.alternatives ? { alternatives: read.alternatives } : {}),
    ...(read.reason ? { reason: read.reason } : {}),
  };
}

/** Just the number (or null): drop-in for the old parseFloat readers. */
export function labNumber(raw: string | number | null | undefined, ctx: LabParseContext = {}): number | null {
  const p = parseLabValue(raw, ctx);
  return p.kind === 'number' || p.kind === 'bound' ? p.value : null;
}

// ------------------------------------------------------------ ranges

const RANGE_LABEL = /^\s*(referenzbereich|referenzwerte?|referenz|normal\s+range|normalbereich|normalwerte?|normal|normbereich|normwerte?|norm|ref\.?\s*bereich|reference\s+range|reference|ref\s+range|ref\.?|range|valeurs?\s+de\s+r[ée]f[ée]rence|v\.?\s*r\.?|valori\s+di\s+riferimento|intervallo\s+di\s+riferimento|zielbereich|target)(?![a-zäöüé])\s*[:=]?\s*/i;

const FEMALE_LONG = String.raw`(?:frauen|frau|weiblich|female|women|woman|femmes?|donne|donna)`;
const MALE_LONG = String.raw`(?:m(?:ä|ae)nner|mann|m(?:ä|ae)nnlich|male|men|man|hommes?|uomini|uomo)`;
// Long labels may stand alone before the number ("Frauen 15-150");
// one-letter labels need punctuation ("w: 15-150", "F: 15-150", "H: 30-400").
const SEX_SPLIT = new RegExp(
  String.raw`(?:^|[\s;,/|(])(?:(${FEMALE_LONG}|${MALE_LONG})\s*[:=.)]?\s*(?=[<>≤≥\d]|bis|unter|ab|über)|(fem\.?|masc\.?|w|f|m|h)\s*[.]?\s*[:=)]\s*)`,
  'gi',
);
const FEMALE_ONLY = new RegExp(String.raw`^(?:${FEMALE_LONG}|fem\.?|w|f)$`, 'i');

const BETWEEN_RE = new RegExp(String.raw`(${NUM_SRC})\s*(?:-|–|—|‒|bis|to|à|\.\.)\s*(${NUM_SRC})`, 'i');
const UPPER_RE = new RegExp(String.raw`^(?:<=|=<|≤|<|bis|unter|kleiner(?:\s+als)?|max\.?|up\s+to|less\s+than|below|inf[ée]rieur\s+[àa])\s*(${NUM_SRC})`, 'i');
const LOWER_RE = new RegExp(String.raw`^(?:>=|=>|≥|>|über|ueber|ab|gr(?:ö|oe)sser(?:\s+als)?|größer(?:\s+als)?|mehr\s+als|min\.?|greater\s+than|above|sup[ée]rieur\s+[àa])\s*(${NUM_SRC})`, 'i');

/** Pick the female (or male) part of "F: 12-150 / M: 30-400". */
function sexSegment(text: string, sex: 'female' | 'male'): string | null {
  const marks: Array<{ female: boolean; start: number; end: number }> = [];
  SEX_SPLIT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEX_SPLIT.exec(text))) {
    const label = m[1] ?? m[2] ?? '';
    marks.push({ female: FEMALE_ONLY.test(label), start: m.index, end: m.index + m[0].length });
  }
  if (marks.length < 1) return null;
  // Only treat as sex-specific when a female label is present (a lone "m"
  // could be the start of "mmol").
  if (!marks.some(k => k.female)) return null;
  const want = marks.find(k => k.female === (sex === 'female'));
  if (!want) return null;
  const next = marks.find(k => k.start > want.start);
  return text.slice(want.end, next ? next.start : undefined).replace(/^[\s;,/|]+|[\s;,/|)]+$/g, '');
}

/**
 * Parse a printed reference range: "11.5-15.0", "5,0 - 7,0", "1'000–2'000",
 * "<5", "< 0,5", "bis 5", ">35", "Referenzbereich: 15 - 150", "Norm: negativ",
 * "F: 15-150 / M: 30-400". Returns null when nothing usable is printed
 * ("siehe Kommentar", "see comment"): show the text instead.
 */
export function parseLabRange(raw: string | null | undefined, ctx: LabParseContext = {}): ParsedLabRange | null {
  if (raw == null) return null;
  const original = String(raw).trim();
  if (!original) return null;
  let text = original.replace(/\s+/g, ' ');
  for (let i = 0; i < 2; i++) text = text.replace(RANGE_LABEL, '');
  let sexSpecific = false;
  const seg = sexSegment(text, ctx.sex === 'male' ? 'male' : 'female');
  if (seg != null) { text = seg; sexSpecific = true; }
  text = text.replace(RANGE_LABEL, '').trim();
  const base: ParsedLabRange = { raw: original, low: null, high: null, qualitative: null, sexSpecific, check: false };

  if (NEG_WORDS.test(text)) return { ...base, qualitative: 'negative' };
  if (POS_WORDS.test(text)) return { ...base, qualitative: 'positive' };

  // The number style decides "1,250": the document's, else the range's own
  // ("0,5-1,250"). Bounds also get the analyte plausibility check.
  const numCtx: LabParseContext = { style: ctx.style ?? inferNumberStyle([text]), title: ctx.title, unit: ctx.unit };
  const read = (tok: string) => readNumber(tok, numCtx);

  const between = text.match(BETWEEN_RE);
  if (between) {
    const a = read(between[1]);
    const b = read(between[2]);
    if (a && b) {
      const check = a.check || b.check || a.value > b.value;
      const low = Math.min(a.value, b.value);
      const high = Math.max(a.value, b.value);
      return { ...base, low, high, check, ...(check ? { reason: a.reason ?? b.reason ?? 'bounds reversed' } : {}) };
    }
  }
  const up = text.match(UPPER_RE);
  if (up) {
    const n = read(up[1]);
    if (n) return { ...base, high: n.value, check: n.check, ...(n.reason ? { reason: n.reason } : {}) };
  }
  const lo = text.match(LOWER_RE);
  if (lo) {
    const n = read(lo[1]);
    if (n) return { ...base, low: n.value, check: n.check, ...(n.reason ? { reason: n.reason } : {}) };
  }
  return null;
}

// ------------------------------------------------------------ style

const DE_WORDS = /\b(referenzbereich|normbereich|norm|bis|negativ|positiv|nachweisbar|befund|blutbild|frauen|weiblich|valeurs|r[ée]f[ée]rence|n[ée]gatif|valori|riferimento)\b/i;

/**
 * Guess a document's decimal mark from its own strings (values + ranges):
 * "0,5", "12,75" are unmistakably decimal commas; "4.5", "0.75" decimal
 * points. Ambiguous "1,250" says nothing. German/French/Italian words with
 * no unambiguous number tip it to 'comma' (Swiss labs). null = unknown.
 */
export function inferNumberStyle(strings: Array<string | number | null | undefined>): NumberStyle | null {
  let comma = 0;
  let point = 0;
  let words = false;
  const tok = new RegExp(NUM_SRC, 'g');
  for (const s of strings) {
    if (s == null || typeof s === 'number') continue;
    const text = String(s);
    if (DE_WORDS.test(text)) words = true;
    if (/\d['’]\d{3}\b/.test(text)) words = true; // Swiss thousands
    let m: RegExpExecArray | null;
    tok.lastIndex = 0;
    while ((m = tok.exec(text))) {
      const t = m[0].replace(/^[-−]/, '').replace(/['’ \u00a0\u202f]/g, '');
      if (t.includes('.') && t.includes(',')) {
        if (t.lastIndexOf(',') > t.lastIndexOf('.')) comma++; else point++;
        continue;
      }
      const cm = t.match(/^(\d+),(\d+)$/);
      if (cm && (cm[2].length !== 3 || /^0+$/.test(cm[1]))) comma++;
      const pm = t.match(/^(\d+)\.(\d+)$/);
      if (pm && (pm[2].length !== 3 || /^0+$/.test(pm[1]))) point++;
    }
  }
  if (comma > point) return 'comma';
  if (point > comma) return 'point';
  if (comma === 0 && point === 0 && words) return 'comma';
  return null;
}

/** Style stored with the row at analysis time, if any. */
export function storedNumberStyle(rawData: unknown): NumberStyle | null {
  let o: unknown = rawData;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
  if (!o || typeof o !== 'object') return null;
  const s = (o as Record<string, unknown>).number_style;
  return s === 'comma' || s === 'point' ? s : null;
}

/**
 * Number style per document for a batch of rows: the stored style first,
 * else inferred from all of that document's values and ranges.
 */
export function numberStylesByDocument(rows: Array<{ document_id?: string | null; value?: unknown; reference_range?: unknown; raw_data?: unknown }>): Map<string, NumberStyle | null> {
  const byDoc = new Map<string, { stored: NumberStyle | null; strings: string[] }>();
  for (const r of rows) {
    const id = r.document_id ?? '';
    if (!id) continue;
    const e = byDoc.get(id) ?? { stored: null, strings: [] };
    e.stored = e.stored ?? storedNumberStyle(r.raw_data);
    if (typeof r.value === 'string') e.strings.push(r.value);
    if (typeof r.reference_range === 'string') e.strings.push(r.reference_range);
    byDoc.set(id, e);
  }
  const out = new Map<string, NumberStyle | null>();
  for (const [id, e] of byDoc) out.set(id, e.stored ?? inferNumberStyle(e.strings));
  return out;
}
