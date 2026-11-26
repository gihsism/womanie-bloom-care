// Birth plan ("birth wishes"): a short guided form from week 28, Swiss
// context (Spital, Geburtshaus, home birth with a Hebamme). Every option
// is worded as a wish to talk through, never as a demand, so the plan
// stays a conversation starter with the midwife and doctor.
//
// Pure functions only. The card keeps the plan in table birth_plans
// (migration 020, one row per user, owner-scoped in /api/db) and in
// localStorage as the device copy; the doctor chart reads it read-only
// through the consent-gated /api/doctors/patient, only when she ticked
// "Show in my doctor's chart".

export type BirthPlanSectionId =
  | 'place'
  | 'companions'
  | 'pain'
  | 'positions'
  | 'interventions'
  | 'first-hour'
  | 'feeding'
  | 'special';

export interface BirthPlanOption {
  id: string;
  label: string;
}

export interface BirthPlanSection {
  id: BirthPlanSectionId;
  title: string;
  description: string;
  options: BirthPlanOption[];
  /** Placeholder for the free-text box. */
  notePrompt: string;
}

/** From which pregnancy week the birth plan card shows. */
export const BIRTH_PLAN_FROM_WEEK = 28;
export const NOTE_MAX = 600;
/** Device copy of the plan (the account copy is the birth_plans row). */
export const BIRTH_PLAN_LOCAL_KEY = (uid: string) => `womanie_birth_plan_${uid}`;

export const BIRTH_PLAN_SECTIONS: BirthPlanSection[] = [
  {
    id: 'place',
    title: 'Where I plan to give birth',
    description: 'Most births in Switzerland are in a hospital (Spital); some families choose a birth centre (Geburtshaus) or a home birth with a Hebamme.',
    options: [
      { id: 'hospital', label: 'Hospital (Spital) birth' },
      { id: 'hospital-midwife-led', label: "I'd like to discuss a midwife-led birth in hospital" },
      { id: 'beleghebamme', label: 'With my own midwife (Beleghebamme) in hospital' },
      { id: 'geburtshaus', label: 'Birth centre (Geburtshaus)' },
      { id: 'home', label: 'Home birth with a Hebamme' },
      { id: 'undecided', label: "I haven't decided yet and would like to talk it through" },
    ],
    notePrompt: 'Name of the hospital or birth centre, your midwife…',
  },
  {
    id: 'companions',
    title: 'Who I would like with me',
    description: 'Who supports you during labour and birth.',
    options: [
      { id: 'partner', label: 'My partner' },
      { id: 'family-friend', label: 'A family member or friend' },
      { id: 'doula', label: 'A doula' },
      { id: 'own-midwife', label: 'My own midwife, if possible' },
      { id: 'fewer-people', label: "I'd like to keep the number of people in the room small" },
      { id: 'students', label: "I'd like to be asked before students are present" },
    ],
    notePrompt: 'Names, or anything your companions should know…',
  },
  {
    id: 'pain',
    title: 'Pain relief',
    description: "You can change your mind at any time during labour; these are only a starting point.",
    options: [
      { id: 'natural', label: "I'd like to start with breathing, movement and massage" },
      { id: 'water', label: "I'd like to use a bath or birth pool for pain relief" },
      { id: 'tens', label: "I'd like to try a TENS machine" },
      { id: 'gas', label: "I'd like to discuss gas and air (Lachgas)" },
      { id: 'opioid', label: "I'd like to discuss injected pain relief (e.g. pethidine)" },
      { id: 'epidural', label: "I'd like to discuss an epidural (PDA)" },
      { id: 'epidural-early', label: "I'd like an epidural as early as possible" },
      { id: 'offer', label: "Please offer me options rather than wait for me to ask" },
      { id: 'decide-later', label: "I'd like to decide during labour" },
    ],
    notePrompt: 'Anything that helps you cope, or that you would rather avoid…',
  },
  {
    id: 'positions',
    title: 'Positions and environment',
    description: 'Moving and changing position can help labour progress.',
    options: [
      { id: 'move-freely', label: "I'd like to move freely and choose my own positions" },
      { id: 'upright', label: "I'd like to try upright positions (standing, kneeling, all fours)" },
      { id: 'ball', label: "I'd like to use a birthing ball, stool or rope" },
      { id: 'water-birth', label: "I'd like to discuss a water birth" },
      { id: 'side', label: "I'd like to try lying on my side" },
      { id: 'calm-room', label: "I'd like dim lights and a quiet room" },
      { id: 'own-music', label: "I'd like to play my own music" },
    ],
    notePrompt: 'Anything about the room, movement or comfort…',
  },
  {
    id: 'interventions',
    title: 'Monitoring and interventions',
    description: 'Your team will always explain why something is suggested; these are your preferences if there is a choice.',
    options: [
      { id: 'explain', label: "Please explain each step and ask for my consent first" },
      { id: 'intermittent-ctg', label: "I'd like to discuss intermittent monitoring (CTG) if all is well" },
      { id: 'induction', label: "I'd like to discuss my options if induction is suggested" },
      { id: 'episiotomy', label: "I'd like to discuss how to avoid a cut (episiotomy) where possible" },
      { id: 'assisted', label: "I'd like to understand what happens in an assisted birth (ventouse or forceps)" },
      { id: 'caesarean-gentle', label: 'If I need a caesarean: partner present and skin-to-skin in theatre, if possible' },
      { id: 'caesarean-planned', label: "I'd like to discuss a planned caesarean" },
    ],
    notePrompt: 'Questions about monitoring, induction or a caesarean…',
  },
  {
    id: 'first-hour',
    title: "Baby's first hour",
    description: 'The time right after birth (sometimes called the golden hour).',
    options: [
      { id: 'skin-to-skin', label: "I'd like skin-to-skin contact straight after birth" },
      { id: 'delayed-cord', label: "I'd like delayed cord clamping, if baby is well" },
      { id: 'partner-cord', label: 'My partner would like to cut the cord' },
      { id: 'partner-skin', label: 'If I cannot, my partner would like skin-to-skin' },
      { id: 'vitamin-k', label: "I'd like to discuss vitamin K for my baby (Konakion)" },
      { id: 'placenta', label: "I'd like to discuss how the placenta is delivered, and see it" },
      { id: 'undisturbed', label: "I'd like weighing and checks to wait until after the first feed" },
    ],
    notePrompt: 'Anything about the first moments with your baby…',
  },
  {
    id: 'feeding',
    title: 'Feeding',
    description: 'Every option is fine; this tells the team how to support you.',
    options: [
      { id: 'breastfeed', label: "I'd like to breastfeed, with help from a lactation consultant (Stillberaterin)" },
      { id: 'formula', label: "I'd like to formula-feed" },
      { id: 'combination', label: "I'd like to combine breast milk and formula" },
      { id: 'undecided', label: "I haven't decided yet" },
      { id: 'colostrum', label: "I'd like to discuss collecting colostrum before the birth" },
      { id: 'ask-first', label: 'Please ask me before giving my baby formula or a dummy' },
    ],
    notePrompt: 'Previous feeding experience, worries, questions…',
  },
  {
    id: 'special',
    title: 'Special needs and wishes',
    description: 'Anything that helps the team care for you as a person.',
    options: [
      { id: 'interpreter', label: "I'd like an interpreter or materials in my language" },
      { id: 'allergies', label: 'I have allergies or a medical condition (see notes)' },
      { id: 'mobility', label: 'I have a disability or mobility needs (see notes)' },
      { id: 'previous-birth', label: "I'd like to talk about a previous difficult birth" },
      { id: 'fear', label: "I'd like support with fear of birth" },
      { id: 'trauma', label: "I'd like a trauma-informed approach (ask before touching)" },
      { id: 'culture', label: 'I have religious or cultural wishes (see notes)' },
      { id: 'diet', label: 'I have dietary needs during the hospital stay' },
    ],
    notePrompt: 'Language, allergies, conditions, wishes for your stay…',
  },
];

export interface BirthPlan {
  v: 1;
  choices: Partial<Record<BirthPlanSectionId, string[]>>;
  notes: Partial<Record<BirthPlanSectionId, string>>;
}

export const EMPTY_PLAN: BirthPlan = { v: 1, choices: {}, notes: {} };

const SECTION_BY_ID = new Map(BIRTH_PLAN_SECTIONS.map(s => [s.id, s]));

export function birthPlanVisible(weeksPregnant: number | null | undefined): boolean {
  return typeof weeksPregnant === 'number' && weeksPregnant >= BIRTH_PLAN_FROM_WEEK;
}

/**
 * Reads a stored plan (object, JSON string, or garbage) into a clean plan:
 * unknown sections and option ids are dropped, notes are trimmed to
 * NOTE_MAX. Never throws.
 */
export function parsePlan(raw: unknown): BirthPlan {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return { ...EMPTY_PLAN, choices: {}, notes: {} }; }
  }
  const out: BirthPlan = { v: 1, choices: {}, notes: {} };
  if (!v || typeof v !== 'object') return out;
  const obj = v as { choices?: unknown; notes?: unknown };
  const choices = obj.choices && typeof obj.choices === 'object' ? obj.choices as Record<string, unknown> : {};
  const notes = obj.notes && typeof obj.notes === 'object' ? obj.notes as Record<string, unknown> : {};
  for (const section of BIRTH_PLAN_SECTIONS) {
    const valid = new Set(section.options.map(o => o.id));
    const picked = choices[section.id];
    if (Array.isArray(picked)) {
      const list = section.options.map(o => o.id).filter(id => picked.includes(id) && valid.has(id));
      if (list.length) out.choices[section.id] = list;
    }
    const note = notes[section.id];
    if (typeof note === 'string' && note.trim()) out.notes[section.id] = note.slice(0, NOTE_MAX);
  }
  return out;
}

export function toggleChoice(plan: BirthPlan, section: BirthPlanSectionId, optionId: string): BirthPlan {
  const def = SECTION_BY_ID.get(section);
  if (!def || !def.options.some(o => o.id === optionId)) return plan;
  const current = plan.choices[section] ?? [];
  const nextSet = current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId];
  // Keep the catalogue order so print and doctor view read the same.
  const ordered = def.options.map(o => o.id).filter(id => nextSet.includes(id));
  const choices = { ...plan.choices };
  if (ordered.length) choices[section] = ordered; else delete choices[section];
  return { ...plan, choices };
}

export function setNote(plan: BirthPlan, section: BirthPlanSectionId, text: string): BirthPlan {
  if (!SECTION_BY_ID.has(section)) return plan;
  const notes = { ...plan.notes };
  const clipped = text.slice(0, NOTE_MAX);
  if (clipped.trim()) notes[section] = clipped; else delete notes[section];
  return { ...plan, notes };
}

export function sectionHasContent(plan: BirthPlan, section: BirthPlanSectionId): boolean {
  return (plan.choices[section]?.length ?? 0) > 0 || !!plan.notes[section]?.trim();
}

export function planProgress(plan: BirthPlan): { done: number; total: number } {
  const total = BIRTH_PLAN_SECTIONS.length;
  const done = BIRTH_PLAN_SECTIONS.filter(s => sectionHasContent(plan, s.id)).length;
  return { done, total };
}

export function isPlanEmpty(plan: BirthPlan): boolean {
  return planProgress(plan).done === 0;
}

export interface PlanSummarySection {
  id: BirthPlanSectionId;
  title: string;
  wishes: string[];
  note: string | null;
}

/** Only the sections she filled in, in catalogue order, with option labels. */
export function planSummary(plan: BirthPlan): PlanSummarySection[] {
  return BIRTH_PLAN_SECTIONS
    .filter(s => sectionHasContent(plan, s.id))
    .map(s => ({
      id: s.id,
      title: s.title,
      wishes: (plan.choices[s.id] ?? [])
        .map(id => s.options.find(o => o.id === id)?.label)
        .filter((l): l is string => !!l),
      note: plan.notes[s.id]?.trim() || null,
    }));
}

/** Short status line for the card header. */
export function planStatusLine(plan: BirthPlan): string {
  const { done, total } = planProgress(plan);
  if (done === 0) return 'Not started';
  if (done === total) return 'All sections filled in';
  return `${done} of ${total} sections`;
}

export const BIRTH_PLAN_FOOTER =
  'These are my wishes for the birth. I understand plans can change, and I would like to talk any change through with my midwife and doctor.';
