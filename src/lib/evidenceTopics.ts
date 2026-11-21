// "What the research says" notes next to the user's own data.
//
// Pure mapping: a lab test name, medicine name or tracker -> a marker,
// and a marker + life stage -> a note id plus the library topic it
// belongs to. The server holds the hand-picked 1-2 items per note
// (api/_lib/research/evidence-notes.ts) and returns them for a list of
// ids (GET /api/research/library?notes=...), so the client never loads
// the whole library. A marker with no rule for the stage shows no note:
// research appears only where the library has something on point.

import { libraryStageFromMode } from './research-library';

export type EvidenceMarker =
  | 'iron'
  | 'vitamin-d'
  | 'thyroid'
  | 'amh'
  | 'glucose'
  | 'b12'
  | 'folate'
  | 'progesterone'
  | 'androgens'
  | 'lipids'
  | 'calcium'
  // trackers
  | 'blood-pressure'
  | 'epds'
  | 'pregnancy-weight'
  | 'hot-flushes'
  | 'hrt'
  | 'cycle-timing';

export interface EvidenceSpec {
  /** Server note id: GET /api/research/library?notes=<id>,<id>. */
  note: string;
  /** Research-library topic id, for the "More in the library" link. */
  topic: string;
  /** Library stage id for the link (null = all stages). */
  stage: string | null;
  /** What the note is about, e.g. "Iron & ferritin". */
  label: string;
}

// ── Test / medicine names -> marker ───────────────────────────────

// Order matters: longer, more specific patterns first (HbA1c before Hb).
const LAB_PATTERNS: [RegExp, EvidenceMarker][] = [
  [/\b(hba1c|hb\s*a1c|a1c|glyc(?:osyl)?ated\s+ha?emoglobin)\b/, 'glucose'],
  [/\b(glucose|blood\s+sugar|ogtt|gtt)\b/, 'glucose'],
  [/\b(amh|anti[\s-]*m[uü]ll?erian)/, 'amh'],
  [/\b(ferritin|iron|transferrin|tsat|ha?emoglobin|hgb|hb)\b/, 'iron'],
  [/\b(vit(?:amin)?\.?\s*d[23]?|25[\s-]*\(?oh\)?|calcidiol|cholecalciferol|calcifediol)(?![a-z])/, 'vitamin-d'],
  [/\b(tsh|thyrotropin|thyroid|free\s*t4|ft4|ft3|free\s*t3|thyroxine|tpo)\b/, 'thyroid'],
  [/\b(b12|b-12|cobalamin|holotranscobalamin)\b/, 'b12'],
  [/\b(folate|folic)\b/, 'folate'],
  [/\b(progesterone|p4)\b/, 'progesterone'],
  [/\b(testosterone|androgens?|dhea-?s?|shbg)\b/, 'androgens'],
  [/\b(cholesterol|ldl|hdl|triglycerides?|lipids?)\b/, 'lipids'],
  [/\bcalcium\b/, 'calcium'],
];

function clean(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Lab test title (as the user's report spells it) -> marker, or null. */
export function labMarker(testName: string | null | undefined): EvidenceMarker | null {
  if (!testName) return null;
  const s = clean(testName);
  for (const [re, marker] of LAB_PATTERNS) if (re.test(s)) return marker;
  return null;
}

const MEDICINE_PATTERNS: [RegExp, EvidenceMarker][] = [
  [/\b(hrt|mht|hormone\s+(?:replacement\s+)?therapy|estradiol|oestradiol|estrogen|oestrogen|oestrogel|estrogel|evorel|utrogestan|tibolone|sandrena|femoston|kliovance|elleste)\b/, 'hrt'],
  [/\b(folic|folate|methylfolate)\b/, 'folate'],
  [/\b(iron|ferrous|ferric|floradix)\b/, 'iron'],
  [/\b(vit(?:amin)?\.?\s*d[23]?|cholecalciferol|colecalciferol)(?![a-z])/, 'vitamin-d'],
  [/\b(b12|cobalamin|cyanocobalamin)\b/, 'b12'],
  [/\bcalcium\b/, 'calcium'],
  [/\b(levothyroxine|thyroxine|euthyrox|eltroxin|synthroid)\b/, 'thyroid'],
];

/** Medicine / supplement name -> marker, or null. */
export function medicineMarker(name: string | null | undefined): EvidenceMarker | null {
  if (!name) return null;
  const s = clean(name);
  for (const [re, marker] of MEDICINE_PATTERNS) if (re.test(s)) return marker;
  return null;
}

// ── Marker + stage -> note ────────────────────────────────────────

const PREG = ['pregnancy'];
const FERTILITY = ['conception', 'ivf'];
const MENO = ['menopause', 'post-menopause'];

interface Rule {
  /** Library stages this rule applies to, or '*' for any (including none). */
  stages: string[] | '*';
  /** Server note id (api/_lib/research/evidence-notes.ts). */
  note: string;
  /** Library topic for the "More in the library" link (same as the server's). */
  topic: string;
}

const LABELS: Record<EvidenceMarker, string> = {
  iron: 'Iron & ferritin',
  'vitamin-d': 'Vitamin D',
  thyroid: 'Thyroid',
  amh: 'AMH',
  glucose: 'Blood sugar',
  b12: 'Vitamin B12',
  folate: 'Folic acid',
  progesterone: 'Progesterone',
  androgens: 'Testosterone',
  lipids: 'Heart health',
  calcium: 'Calcium & bones',
  'blood-pressure': 'Blood pressure',
  epds: 'Mood',
  'pregnancy-weight': 'Weight gain',
  'hot-flushes': 'Hot flushes',
  hrt: 'HRT',
  'cycle-timing': 'Timing',
};

// First rule whose stages include the user's stage wins. A marker/stage
// pair with no rule gets no note on purpose (nothing on point).
const RULES: Record<EvidenceMarker, Rule[]> = {
  iron: [
    { stages: PREG, note: 'iron-pregnancy', topic: 'anaemia-pregnancy' },
    { stages: ['postpartum'], note: 'iron-postpartum', topic: 'iron-deficiency' },
    { stages: '*', note: 'iron', topic: 'iron-deficiency' },
  ],
  'vitamin-d': [
    { stages: PREG, note: 'vitamin-d-pregnancy', topic: 'vitamin-d-pregnancy' },
    { stages: MENO, note: 'bone-menopause', topic: 'bone-health' },
    { stages: '*', note: 'vitamin-d', topic: 'vitamin-d' },
  ],
  thyroid: [
    { stages: [...PREG, 'postpartum'], note: 'thyroid-pregnancy', topic: 'thyroid-pregnancy' },
    { stages: FERTILITY, note: 'thyroid-fertility', topic: 'thyroid-pregnancy' },
  ],
  amh: [{ stages: [...FERTILITY, 'menstrual-cycle'], note: 'amh', topic: 'amh-ovarian-reserve' }],
  glucose: [{ stages: PREG, note: 'glucose-pregnancy', topic: 'gestational-diabetes' }],
  b12: [{ stages: '*', note: 'b12', topic: 'vitamin-b12' }],
  folate: [{ stages: [...FERTILITY, ...PREG], note: 'folate', topic: 'folic-acid' }],
  progesterone: [{ stages: ['ivf'], note: 'progesterone-ivf', topic: 'luteal-support' }],
  androgens: [{ stages: ['menstrual-cycle', ...FERTILITY], note: 'androgens', topic: 'pcos' }],
  lipids: [{ stages: MENO, note: 'heart-menopause', topic: 'menopause-weight-heart' }],
  calcium: [{ stages: MENO, note: 'bone-menopause', topic: 'bone-health' }],
  'blood-pressure': [
    // Menopause: the heart-health note sits with cholesterol on the lab
    // card instead, so the same note doesn't show twice on one screen.
    { stages: PREG, note: 'pre-eclampsia', topic: 'pre-eclampsia' },
  ],
  epds: [
    { stages: PREG, note: 'mood-pregnancy', topic: 'perinatal-mental-health-pregnancy' },
    { stages: ['postpartum'], note: 'mood-postpartum', topic: 'postnatal-depression' },
  ],
  'pregnancy-weight': [{ stages: PREG, note: 'weight-gain-pregnancy', topic: 'weight-gain-pregnancy' }],
  'hot-flushes': [{ stages: MENO, note: 'hot-flushes', topic: 'hot-flushes' }],
  hrt: [{ stages: MENO, note: 'hrt', topic: 'hrt-benefits-risks' }],
  'cycle-timing': [{ stages: ['conception'], note: 'cycle-timing', topic: 'cycle-tracking' }],
};

/** App mode (profiles.life_stage) -> library stage id. */
export function evidenceStage(mode: string | null | undefined): string | null {
  return libraryStageFromMode(mode);
}

/** Marker + app mode -> the note to show, or null (no note). */
export function evidenceSpec(marker: EvidenceMarker | null | undefined, mode: string | null | undefined): EvidenceSpec | null {
  if (!marker) return null;
  const stage = evidenceStage(mode);
  for (const rule of RULES[marker] ?? []) {
    if (rule.stages === '*' || (stage && rule.stages.includes(stage))) {
      return { note: rule.note, topic: rule.topic, stage, label: LABELS[marker] };
    }
  }
  return null;
}

/**
 * Up to `max` distinct notes for a list of markers, in the order given
 * (callers put flagged results first). Duplicate notes collapse.
 */
export function specsForMarkers(
  markers: (EvidenceMarker | null | undefined)[],
  mode: string | null | undefined,
  max = 2,
): EvidenceSpec[] {
  const out: EvidenceSpec[] = [];
  const seen = new Set<string>();
  for (const m of markers) {
    const spec = evidenceSpec(m, mode);
    if (!spec || seen.has(spec.note)) continue;
    seen.add(spec.note);
    out.push(spec);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Notes for the user's lab results, flagged (abnormal/critical) results
 * first. `label` is the card's own name for the test (e.g. "Iron Stores"),
 * used when the report's title is not recognised.
 */
export function specsForLabs(
  labs: { title: string; label?: string; status?: string | null }[],
  mode: string | null | undefined,
  max = 2,
): EvidenceSpec[] {
  const flagged = (s?: string | null) => s === 'abnormal' || s === 'critical';
  const ordered = [...labs.filter((l) => flagged(l.status)), ...labs.filter((l) => !flagged(l.status))];
  return specsForMarkers(ordered.map((l) => labMarker(l.title) ?? labMarker(l.label)), mode, max);
}

/** /library deep link for a note (stage + topic). */
export function libraryLink(spec: Pick<EvidenceSpec, 'topic' | 'stage'>): string {
  const qs = new URLSearchParams();
  qs.set('stage', spec.stage ?? 'all');
  qs.set('topic', spec.topic);
  return `/library?${qs}`;
}

/** Every rule (tests check each note exists on the server with the same topic). */
export function allEvidenceRules(): { marker: EvidenceMarker; note: string; topic: string }[] {
  return (Object.keys(RULES) as EvidenceMarker[]).flatMap((marker) =>
    RULES[marker].map((r) => ({ marker, note: r.note, topic: r.topic })),
  );
}
