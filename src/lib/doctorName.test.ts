import { describe, it, expect } from 'vitest';
import { doctorDisplayName } from './doctorName';

describe('doctorDisplayName', () => {
  it('uses the title only when the clinician set one', () => {
    expect(doctorDisplayName('Dr.', 'Laura Meier')).toBe('Dr. Laura Meier');
    expect(doctorDisplayName(null, 'Sara Rossi')).toBe('Sara Rossi'); // a midwife, not "Dr."
    expect(doctorDisplayName('', 'Sara Rossi')).toBe('Sara Rossi');
  });
  it('never doubles a title already in the name', () => {
    expect(doctorDisplayName('Dr.', 'Dr. Laura Meier')).toBe('Dr. Laura Meier');
  });
});
