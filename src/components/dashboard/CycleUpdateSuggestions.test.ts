import { describe, it, expect } from 'vitest';
import { generateSuggestions } from './CycleUpdateSuggestions';

const tsh = [{ id: 't', title: 'TSH', value: '4.8', unit: 'mIU/L', reference_range: '0.4-4.0', status: 'abnormal', date_recorded: '2026-11-12' }];
const ids = (stage: string | null) => generateSuggestions(tsh, stage).map(s => s.id);

describe('thyroid and cycle length', () => {
  it('is suggested where a natural cycle is predicted', () => {
    expect(ids('menstrual-cycle')).toContain('thyroid_cycle');
    expect(ids('conception')).toContain('thyroid_cycle');
  });
  it('is not suggested in pregnancy, after birth, on the pill or after menopause', () => {
    for (const stage of ['pregnancy', 'postpartum', 'contraception', 'menopause', 'post-menopause']) {
      expect(ids(stage)).not.toContain('thyroid_cycle');
    }
  });
});
