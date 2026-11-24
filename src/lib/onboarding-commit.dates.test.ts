import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// The onboarding date pickers hand back LOCAL midnight. Saving them with
// toISOString() stored the day before for anyone east of UTC (Zürich):
// a last period on 20 Nov became 19 Nov in period_tracking.
const upserts: { table: string; row: Record<string, unknown> }[] = [];
vi.mock('@/integrations/db/client', () => ({
  db: { from: (table: string) => ({ upsert: async (row: Record<string, unknown>) => { upserts.push({ table, row }); return { error: null }; } }) },
}));
vi.mock('@/lib/account-data', () => ({ pushAccountData: () => {} }));

import { commitOnboarding, localYmd } from './onboarding-commit';
import type { OnboardingData } from '@/contexts/OnboardingContext';

const tz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Europe/Zurich'; });
afterAll(() => { process.env.TZ = tz; });

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });

describe('onboarding saves the calendar day that was picked', () => {
  it('localYmd keeps the local day', () => {
    expect(localYmd(new Date(2026, 10, 20))).toBe('2026-11-20');
    // As it comes back from the onboarding cache (JSON in localStorage).
    expect(localYmd(JSON.parse(JSON.stringify(new Date(2026, 0, 1))))).toBe('2026-01-01');
  });

  it('last period, due date, birth date and date of birth are not shifted a day back', async () => {
    const data = {
      basicInfo: { dateOfBirth: new Date(1993, 3, 12), height: 168, heightUnit: 'cm', weight: 60, weightUnit: 'kg', bloodType: '' },
      lifeStage: { stage: 'regular-cycle' },
      regularCycle: { lastPeriodStart: new Date(2026, 10, 20), averageCycleLength: 29, mainFocus: 'general' },
      postpartum: { birthDate: new Date(2026, 9, 3), mainConcerns: [] },
      currentStep: 4,
    } as unknown as OnboardingData;
    await commitOnboarding({ id: 'u1' }, data);
    expect(upserts.find((u) => u.table === 'period_tracking')?.row.period_start_date).toBe('2026-11-20');
    expect(store.get('womanie_postpartum_birth_u1')).toBe('2026-10-03');
    expect(JSON.parse(store.get('womanie_basic_info_u1')!).dateOfBirth).toBe('1993-04-12');

    upserts.length = 0;
    await commitOnboarding({ id: 'u1' }, { ...data, lifeStage: { stage: 'pregnant' }, pregnancy: { dateType: 'dueDate', dueDate: new Date(2027, 1, 14) } } as unknown as OnboardingData);
    expect(upserts.find((u) => u.table === 'profiles')?.row.pregnancy_due_date).toBe('2027-02-14');
  });
});
