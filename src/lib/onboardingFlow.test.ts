import { describe, it, expect } from 'vitest';
import { onboardingStage, withDobPart, ONBOARDING_SCREENS } from './onboardingFlow';
import type { OnboardingData } from '@/contexts/OnboardingContext';

const d = (s: Date) => [s.getFullYear(), s.getMonth() + 1, s.getDate()];

describe('date of birth from Year / Month / Day', () => {
  it('changing the month never rolls into the next month', () => {
    // Was setMonth(): 31 Jan with February picked became 3 March.
    expect(d(withDobPart(new Date(1990, 0, 31), { month: 1 }))).toEqual([1990, 2, 28]);
    expect(d(withDobPart(new Date(1992, 0, 31), { month: 1 }))).toEqual([1992, 2, 29]);
    expect(d(withDobPart(new Date(1990, 2, 31), { month: 3 }))).toEqual([1990, 4, 30]);
  });

  it('29 Feb with a non-leap year picked stays in February', () => {
    expect(d(withDobPart(new Date(1992, 1, 29), { year: 1993 }))).toEqual([1993, 2, 28]);
  });

  it('keeps the other parts and starts from today when nothing is picked', () => {
    expect(d(withDobPart(new Date(1990, 5, 15), { day: 3 }))).toEqual([1990, 6, 3]);
    expect(d(withDobPart(undefined, { year: 1995 }, new Date(2026, 10, 24)))).toEqual([1995, 11, 24]);
    // As cached by the onboarding context (a JSON string).
    expect(d(withDobPart(JSON.parse(JSON.stringify(new Date(1990, 5, 15))), { year: 1991 }))).toEqual([1991, 6, 15]);
  });
});

describe('the colours the onboarding screens wear', () => {
  const make = (stage: string, mainFocus?: string) => ({ lifeStage: { stage }, regularCycle: mainFocus ? { mainFocus } : undefined }) as unknown as OnboardingData;
  it('follow the stage the answers would save', () => {
    expect(onboardingStage(make(''))).toBeNull();
    expect(onboardingStage(make('pregnant'))).toBe('pregnancy');
    expect(onboardingStage(make('trying-to-conceive'))).toBe('conception');
    expect(onboardingStage(make('regular-cycle'))).toBe('menstrual-cycle');
    expect(onboardingStage(make('regular-cycle', 'contraception'))).toBe('contraception');
    expect(onboardingStage(make('regular-cycle', 'ivf'))).toBe('ivf');
  });
  it('the flow is at most five screens', () => {
    expect(ONBOARDING_SCREENS).toBeLessThanOrEqual(5);
  });
});
