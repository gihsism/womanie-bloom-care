import { describe, it, expect } from 'vitest';
import { computeSetupSteps, setupProgress } from './doctorSetup';

const FULL_PROFILE = {
  avatar_url: 'https://x/a.jpg', specialty: 'Gynecology', languages: ['German'],
  verification_status: 'approved', is_verified: true, practice_address: 'Bahnhofstrasse 1, 8001 Zürich',
};
const SETTINGS = { is_available: true, consultation_price: 120, video_enabled: true };
const HOURS = [{ is_active: true, start_time: '09:00:00', end_time: '17:00:00' }];

describe('doctor setup checklist', () => {
  it('a brand-new doctor has nothing done and is not bookable', () => {
    const steps = computeSetupSteps({ verification_status: 'pending' }, null, []);
    const p = setupProgress(steps);
    expect(p.done).toBe(0);
    expect(p.bookable).toBe(false);
    expect(steps.map(s => s.id)).toEqual(['photo', 'specialty', 'languages', 'price', 'hours', 'bookings', 'licence']);
  });

  it('hides the address step until the column exists (migration 017)', () => {
    expect(computeSetupSteps({}, null, []).some(s => s.id === 'address')).toBe(false);
    expect(computeSetupSteps({ practice_address: null }, null, []).some(s => s.id === 'address')).toBe(true);
  });

  it('complete profile + hours + bookings on + approved = complete and bookable', () => {
    const p = setupProgress(computeSetupSteps(FULL_PROFILE, SETTINGS, HOURS));
    expect(p).toEqual({ done: 8, total: 8, complete: true, bookable: true });
  });

  it('bookable needs approval, opening hours AND Accept new bookings', () => {
    expect(setupProgress(computeSetupSteps({ ...FULL_PROFILE, verification_status: 'pending' }, SETTINGS, HOURS)).bookable).toBe(false);
    expect(setupProgress(computeSetupSteps(FULL_PROFILE, { ...SETTINGS, is_available: false }, HOURS)).bookable).toBe(false);
    expect(setupProgress(computeSetupSteps(FULL_PROFILE, SETTINGS, [{ ...HOURS[0], is_active: false }])).bookable).toBe(false);
    // Profile extras are nice-to-have, not required to be bookable.
    expect(setupProgress(computeSetupSteps({ verification_status: 'approved' }, SETTINGS, HOURS)).bookable).toBe(true);
  });

  it('counts additional specialties and ignores blank languages', () => {
    const steps = computeSetupSteps({ specialties: ['PCOS'], languages: ['  '] }, null, []);
    expect(steps.find(s => s.id === 'specialty')!.done).toBe(true);
    expect(steps.find(s => s.id === 'languages')!.done).toBe(false);
  });

  it('explains each licence status in plain words', () => {
    const hint = (status: string | null) => computeSetupSteps({ verification_status: status }, null, []).find(s => s.id === 'licence')!.hint;
    expect(hint(null)).toMatch(/checking your licence/);
    expect(hint('rejected')).toMatch(/could not verify/);
    expect(hint('revoked')).toMatch(/withdrawn/);
    expect(hint('approved')).toMatch(/verified/);
  });

  it('every actionable step points to a setting', () => {
    for (const s of computeSetupSteps(FULL_PROFILE, SETTINGS, HOURS)) {
      if (s.id === 'licence') expect(s.anchor).toBeNull();
      else expect(s.anchor).toMatch(/^setup-/);
    }
  });
});
