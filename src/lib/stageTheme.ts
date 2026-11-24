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

/** The doctor side's colour set (index.css [data-stage="clinic"]). */
export const CLINIC_THEME = 'clinic';

/**
 * Doctor pages: switch <html> to the clinic colours. Not remembered on the
 * device (the doctor's own patient view keeps its stage), and returns an
 * undo that puts back whatever was there before.
 */
export function applyClinicTheme(): () => void {
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  const before = root.getAttribute('data-stage');
  root.setAttribute('data-stage', CLINIC_THEME);
  return () => {
    // Only undo our own change: a page that set a stage since keeps it.
    if (root.getAttribute('data-stage') !== CLINIC_THEME) return;
    if (before && before !== CLINIC_THEME) root.setAttribute('data-stage', before);
    else root.removeAttribute('data-stage');
  };
}
