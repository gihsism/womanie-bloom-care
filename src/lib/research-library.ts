// Client types + labels for the /library page (data comes from
// GET /api/research/library, see api/_routes/research/library.ts).

export type EvidenceLevel = 'guideline' | 'systematic review' | 'study';

export interface LibraryItem {
  id: string;
  pmid: string;
  title: string;
  source: string;
  year: number;
  evidenceLevel: EvidenceLevel;
  certainty: 'high' | 'moderate' | 'low' | 'very low' | 'not stated';
  landmark: boolean;
  url: string;
  summary: string;
  keyPoints: string[];
  lifeStages: string[];
  topics: string[];
  tags: string[];
}

export interface LibraryResponse {
  version: string;
  disclaimer: string;
  stage: string;
  topic: string | null;
  total: number;
  topics: { id: string; label: string; count: number }[];
  items: LibraryItem[];
}

export const LIBRARY_STAGES: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'menstrual-cycle', label: 'Cycle' },
  { id: 'conception', label: 'Trying to conceive' },
  { id: 'pregnancy', label: 'Pregnancy' },
  { id: 'postpartum', label: 'After birth' },
  { id: 'contraception', label: 'Contraception' },
  { id: 'ivf', label: 'IVF' },
  { id: 'menopause', label: 'Menopause' },
  { id: 'post-menopause', label: 'Post-menopause' },
  { id: 'general', label: 'General health' },
];

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  guideline: 'Clinical guideline',
  'systematic review': 'Research review',
  study: 'Study',
};

/** Maps profiles.life_stage / app mode onto a library stage id. */
export function libraryStageFromMode(mode: string | null | undefined): string | null {
  if (!mode) return null;
  const m = mode.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'pre-menstrual': 'menstrual-cycle',
    menstrual: 'menstrual-cycle',
    'regular-cycle': 'menstrual-cycle',
    'trying-to-conceive': 'conception',
    pregnant: 'pregnancy',
    perimenopause: 'menopause',
  };
  if (aliases[m]) return aliases[m];
  return LIBRARY_STAGES.some((s) => s.id === m && m !== 'all') ? m : null;
}
