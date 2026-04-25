// Canonical unit-string normalisation.
//
// Pairs with normalize-test-title.ts. Claude pulls units from
// whatever the lab printed: "mcg/L" / "µg/L" / "μg/L" / "ug/L" /
// "MCG/L" — all the same unit, four different strings, five if you
// count subtle Unicode codepoints. Without normalisation, two rows
// with the same canonical title and the same actual unit appear
// "different" to anything comparing units (HealthTrends sparkline
// y-axis, the compare-two-docs paired-diff view, the % change in
// NewDocInsights).
//
// Important: this normalises NOTATION, not values. We never convert
// between units (mg/dL ↔ mmol/L), since that requires per-test
// conversion factors and getting one wrong would be far worse than
// just leaving the data alone.

const MICRO_VARIANTS = [
  'µ', // µ MICRO SIGN
  'μ', // μ Greek small letter mu
  'mc',     // "mc" prefix that sometimes substitutes
];

// Replace every micro variant with the canonical Greek μ.
function canonicalizeMicro(s: string): string {
  let out = s;
  // Two-letter "mc" prefix: only when followed by g/g/L/m, otherwise
  // could be a real word fragment. We're conservative.
  out = out.replace(/\bmc(g|G)\b/g, 'μg');
  // Singular replacements.
  out = out.replace(/µ/g, 'μ');
  return out;
}

// Casing rules for known unit segments. Keys are lowercase; values are
// the canonical casing.
const CASE_MAP: Record<string, string> = {
  ml: 'mL',
  dl: 'dL',
  l: 'L',
  ul: 'μL',
  miu: 'mIU',
  iu: 'IU',
  meq: 'mEq',
  mg: 'mg',
  g: 'g',
  ng: 'ng',
  pg: 'pg',
  μg: 'μg',
  mol: 'mol',
  mmol: 'mmol',
  μmol: 'μmol',
  nmol: 'nmol',
  pmol: 'pmol',
  fl: 'fL',
  '%': '%',
};

function fixSegmentCase(seg: string): string {
  // Some segments stick a number to the unit (e.g. "10^9/L"). Leave
  // them alone — only re-case if a clean alphabetic match exists.
  const trimmed = seg.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (CASE_MAP[lower]) return CASE_MAP[lower];
  // Try without unicode handling: "ug" → μg
  if (lower === 'ug') return 'μg';
  if (lower === 'umol') return 'μmol';
  // Mixed-case values that aren't in the table — preserve user input.
  return trimmed;
}

// Collapse repeated whitespace and remove spaces around the divider.
function collapseSlashSpaces(s: string): string {
  return s.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a unit string to its canonical notation. Returns the
 * trimmed input unchanged when we can't classify it confidently —
 * better to keep what Claude wrote than mis-rewrite an exotic unit.
 */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  if (typeof unit !== 'string') return null;
  let s = unit.trim();
  if (!s) return null;

  s = canonicalizeMicro(s);
  s = collapseSlashSpaces(s);

  // Only attempt segment-level recasing on classic numerator/
  // denominator patterns ("X/Y" with no extra punctuation).
  if (/^[A-Za-z%μ]+\/[A-Za-z%μ]+$/.test(s)) {
    const [num, den] = s.split('/');
    return `${fixSegmentCase(num)}/${fixSegmentCase(den)}`;
  }
  // Bare unit with no divider.
  if (/^[A-Za-z%μ]+$/.test(s)) {
    return fixSegmentCase(s);
  }
  return s;
}
