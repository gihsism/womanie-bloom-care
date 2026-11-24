import { LIFE_STAGES } from './lifeStage';

// The one switch for the per-stage colours (idea 4 "Colour by stage"):
// <html data-stage="pregnancy"> picks the matching token block in
// src/index.css. Components never pick a stage colour themselves; they use
// the tokens (bg-stage-head, text-stage-accent, text-primary …).
//
// The last stage is remembered on the device so Records, Ask AI, Visits
// and Me open in the right colour before the profile has loaded.

const KEY = 'womanie_stage_theme';

export function isStoredStage(v: unknown): v is (typeof LIFE_STAGES)[number] {
  return typeof v === 'string' && (LIFE_STAGES as readonly string[]).includes(v);
}

export function applyStageTheme(stage: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!isStoredStage(stage)) {
    root.removeAttribute('data-stage');
    return;
  }
  if (root.getAttribute('data-stage') !== stage) root.setAttribute('data-stage', stage);
  try { localStorage.setItem(KEY, stage); } catch { /* storage blocked */ }
}

/** At start-up: the stage this device saw last (if any). */
export function initStageTheme(): void {
  try {
    const v = localStorage.getItem(KEY);
    if (isStoredStage(v)) document.documentElement.setAttribute('data-stage', v);
  } catch { /* storage blocked */ }
}
