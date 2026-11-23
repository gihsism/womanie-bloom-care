import type { LifeStage } from '@/components/dashboard/DashboardHeader';

// profiles.life_stage is free text in the database. Older rows, onboarding
// stage ids and hand edits can hold values the dashboard has no mode for
// ("perimenopause", "pregnant", "trying-to-conceive"...). Rendering those
// as-is left Home without a mode: no mode name, no hero, generic cards.
// Map known aliases onto a real mode and fall back to the cycle mode.

export const LIFE_STAGES: readonly LifeStage[] = [
  'pre-menstrual',
  'menstrual-cycle',
  'contraception',
  'conception',
  'ivf',
  'pregnancy',
  'postpartum',
  'menopause',
  'post-menopause',
];

export const LIFE_STAGE_ALIASES: Record<string, LifeStage> = {
  pregnant: 'pregnancy',
  'trying-to-conceive': 'conception',
  ttc: 'conception',
  'regular-cycle': 'menstrual-cycle',
  menstrual: 'menstrual-cycle',
  cycle: 'menstrual-cycle',
  premenstrual: 'pre-menstrual',
  perimenopause: 'menopause',
  'peri-menopause': 'menopause',
  postmenopause: 'post-menopause',
  'post_menopause': 'post-menopause',
};

export function normalizeLifeStage(raw: unknown): LifeStage {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((LIFE_STAGES as readonly string[]).includes(v)) return v as LifeStage;
  return LIFE_STAGE_ALIASES[v] ?? 'menstrual-cycle';
}
