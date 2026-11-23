import type { LifeStage } from '@/components/dashboard/DashboardHeader';

// Plain names for each life stage, shown to the user (no "Mode", no
// jargon). Labels only: the stored profiles.life_stage values (the keys)
// never change.
export const STAGE_LABELS: Record<LifeStage, string> = {
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

export function stageLabel(mode: LifeStage): string {
  return STAGE_LABELS[mode] ?? 'Period tracking';
}
