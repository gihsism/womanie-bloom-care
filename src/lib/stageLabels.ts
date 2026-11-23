import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { LIFE_STAGE_LABELS } from './lifeStageLabels';

// Plain names for each life stage, shown to the user. One source of truth:
// src/lib/lifeStageLabels.ts (labels only; stored life_stage keys never change).
export const STAGE_LABELS: Record<LifeStage, string> = LIFE_STAGE_LABELS;

export function stageLabel(mode: LifeStage): string {
  return STAGE_LABELS[mode] ?? 'Period tracking';
}
