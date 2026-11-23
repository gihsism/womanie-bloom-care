import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { LIFE_STAGES, LIFE_STAGE_ALIASES } from './lifeStage';

// The one place the app turns a stored life stage into words a person
// reads. Labels only: the stored keys (profiles.life_stage: 'conception',
// 'pre-menstrual', ...) never change, or existing accounts would break.
// Plain phrases, no "Mode", no medical jargon (SIMPLIFY_PLAN §4 rule 2).

export const LIFE_STAGE_LABELS: Record<LifeStage, string> = {
  'pre-menstrual': 'Before first period',
  'menstrual-cycle': 'Period tracking',
  contraception: 'Birth control',
  conception: 'Trying to conceive',
  ivf: 'IVF',
  pregnancy: 'Pregnancy',
  postpartum: 'After birth',
  menopause: 'Menopause',
  'post-menopause': 'After menopause',
};

// One short line under each label, for the Me -> Life stage picker.
export const LIFE_STAGE_DESCRIPTIONS: Record<LifeStage, string> = {
  'pre-menstrual': 'Getting ready for a first period',
  'menstrual-cycle': 'Track periods and see what comes next',
  contraception: 'Pill, ring, coil or another method',
  conception: 'Find your fertile days',
  ivf: 'Follow your treatment step by step',
  pregnancy: 'Week by week until the birth',
  postpartum: 'Your recovery and your baby',
  menopause: 'Symptoms around the change',
  'post-menopause': 'Staying well after menopause',
};

/**
 * Label for any stored value. Known keys and their old aliases
 * ('pregnant', 'perimenopause', ...) get the plain label; anything else
 * is shown as written (dashes to spaces) rather than guessed, so a doctor
 * never sees a stage the patient didn't choose.
 */
export function lifeStageLabel(raw: string | null | undefined): string {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!v) return '';
  if ((LIFE_STAGES as readonly string[]).includes(v)) return LIFE_STAGE_LABELS[v as LifeStage];
  const alias = LIFE_STAGE_ALIASES[v];
  if (alias) return LIFE_STAGE_LABELS[alias];
  const text = v.replace(/[-_]+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
