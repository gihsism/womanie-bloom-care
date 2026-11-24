import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import type { OnboardingData } from '@/contexts/OnboardingContext';
import { deriveLifeStage } from './onboarding-commit';
import { normalizeLifeStage } from './lifeStage';

// The first-run flow (idea 4): five screens, one question each.
//   1 Which stage are you in?          /onboarding/life-stage
//   2 The stage's first question       /onboarding/mode-setup
//   3 The stage's second question      /onboarding/mode-setup?q=2
//   4 About you (skippable)            /onboarding/basic-info
//   5 Done                             /onboarding/success
// What is saved and every rule for "can continue" are the same as the
// old three-step flow; only the order and the number of screens changed.
export const ONBOARDING_SCREENS = 5;

export const ONBOARDING_PATHS = {
  stage: '/onboarding/life-stage',
  first: '/onboarding/mode-setup',
  second: '/onboarding/mode-setup?q=2',
  about: '/onboarding/basic-info',
  done: '/onboarding/success',
} as const;

/**
 * The colour set the onboarding screens wear: the stage the answers so
 * far would save (Period tracking + "Avoiding pregnancy" = Birth control).
 */
export function onboardingStage(data: Pick<OnboardingData, 'lifeStage' | 'regularCycle'>): LifeStage | null {
  const s = deriveLifeStage(data as OnboardingData);
  return s ? normalizeLifeStage(s) : null;
}

/**
 * Date of birth from the Year / Month / Day pickers. Changing one part
 * keeps the others and never rolls into the next month: 31 Jan with
 * February picked is 28 (or 29) Feb, not 3 March as setMonth() gave.
 * With nothing picked yet the other parts start from today, as before.
 */
export function withDobPart(prev: Date | string | undefined, part: { year?: number; month?: number; day?: number }, today = new Date()): Date {
  const base = prev ? new Date(prev) : today;
  const year = part.year ?? base.getFullYear();
  const month = part.month ?? base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(part.day ?? base.getDate(), daysInMonth);
  return new Date(year, month, day);
}
