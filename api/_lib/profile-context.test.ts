import { describe, expect, it } from 'vitest';
import { buildProfileContext } from './profile-context';

const now = new Date('2026-11-24T12:00:00Z');
// A user who did IVF and is now pregnant: the IVF fields are still on her profile.
const base = { full_name: 'Lena', pregnancy_due_date: '2027-01-22', ivf_start_date: '2026-11-19', ivf_phase: 'stimulation' };

describe('buildProfileContext', () => {
  it('pregnancy: gives the week, not the stale IVF phase', () => {
    const s = buildProfileContext({ ...base, life_stage: 'pregnancy' }, now);
    expect(s).toContain('Life stage: pregnancy');
    expect(s).toMatch(/Pregnancy: due 2027-01-22 \(week 31 \+ 4d, 59 days to go\)/);
    expect(s).not.toContain('IVF');
  });

  it('ivf: gives the IVF phase and day, not a stale due date', () => {
    const s = buildProfileContext({ ...base, life_stage: 'ivf' }, now);
    expect(s).toContain('IVF phase: stimulation (day 6 of journey)');
    expect(s).not.toContain('Pregnancy:');
  });

  it('postpartum or menopause: neither anchor', () => {
    for (const stage of ['postpartum', 'menopause']) {
      const s = buildProfileContext({ ...base, life_stage: stage }, now);
      expect(s).not.toContain('IVF');
      expect(s).not.toContain('days to go');
    }
  });

  it('no stage', () => {
    expect(buildProfileContext({}, now)).toBe('Patient: Unknown, Life stage: Not specified\n\n');
  });
});
