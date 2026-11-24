import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Records and Visits are bottom-nav tabs, so their header has no back
// arrow. Sub-views keep theirs (e.g. Ask AI's Past chats "Back to chat").
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('tab pages have no back arrow', () => {
  it.each([
    ['Records', './MedicalHistory.tsx'],
    ['Visits', './dashboard/Appointments.tsx'],
  ])('%s', (_name, file) => {
    const src = read(file);
    expect(src).not.toMatch(/\bArrowLeft\b/);
    expect(src).not.toMatch(/aria-label="Back to dashboard"/);
    expect(src).not.toMatch(/>\s*Back\s*</);
  });

  it('a sub-view keeps its back arrow', () => {
    expect(read('./AIDoctorChat.tsx')).toContain('aria-label="Back to chat"');
  });
});
