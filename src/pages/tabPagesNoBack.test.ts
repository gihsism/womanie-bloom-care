import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// The 5 bottom-nav tabs (Home, Records, Ask AI, Visits, Me) have no back
// arrow in their header. Sub-views keep theirs (e.g. Ask AI's Past chats "Back to chat").
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('tab pages have no back arrow', () => {
  it.each([
    ['Records', './MedicalHistory.tsx'],
    ['Visits', './dashboard/Appointments.tsx'],
  ])('%s', (_name, file) => {
    const src = read(file);
    // The lucide ArrowLeft icon (the 'ArrowLeft' key name in a tablist's
    // keyboard handler is not a back arrow).
    expect(src).not.toMatch(/<ArrowLeft\b/);
    expect(src).not.toMatch(/import\s*\{[^}]*\bArrowLeft\b[^}]*\}\s*from\s*'lucide-react'/);
    expect(src).not.toMatch(/aria-label="Back to dashboard"/);
    expect(src).not.toMatch(/>\s*Back\s*</);
  });

  it('Home (and its idea-4 blocks) has no back arrow', () => {
    for (const f of ['./PatientDashboard.tsx', '../components/home/HomeView.tsx', '../components/home/StageHeader.tsx']) {
      const src = read(f);
      expect(src).not.toMatch(/\b(ArrowLeft|ChevronLeft)\b/);
      expect(src).not.toContain('navigate(-1)');
    }
  });

  it('Ask AI shows its back arrow only inside the Past chats sub-view', () => {
    const chat = read('./AIDoctorChat.tsx');
    expect(chat).toMatch(/\{showPast && \(\s*<Button[^\n]*aria-label="Back to chat"/);
    expect(chat.match(/<ArrowLeft\b/g) ?? []).toHaveLength(1);
  });

  it('Me shows its back arrow only on a section sub-page', () => {
    const me = read('./dashboard/Settings.tsx');
    expect(me).toMatch(/\{section \? \(\s*<SubPageHeader[^>]*backLabel="Me"/);
    expect(me).not.toMatch(/<ArrowLeft\b/);
  });

  it('a sub-view keeps its back arrow', () => {
    expect(read('./AIDoctorChat.tsx')).toContain('aria-label="Back to chat"');
  });
});
