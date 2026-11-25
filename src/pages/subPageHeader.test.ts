import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Idea 4: every page one level below a tab uses the one shared header
// (components/SubPageHeader): round back button, plain title, at most one
// action. No old-style header (grey bar, icon before the title, account
// menu, logo) and no tinted gradient intro boxes.
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const SUB_PAGES: Array<[string, string]> = [
  ['Track (stage page)', './dashboard/StagePage.tsx'],
  ['Baby', './dashboard/BabyPage.tsx'],
  ['Labour & birth', './dashboard/BirthRecord.tsx'],
  ['Needs your attention', './dashboard/Notifications.tsx'],
  ['Emergency contacts', './dashboard/Emergency.tsx'],
  ['Connected devices', './dashboard/Devices.tsx'],
  ['Help', './dashboard/Help.tsx'],
  ['Privacy', './dashboard/Privacy.tsx'],
  ['Compare documents', './dashboard/CompareDocs.tsx'],
  ['Panel', './dashboard/PanelDetail.tsx'],
  ['Me sections', './dashboard/Settings.tsx'],
];

describe('sub-pages share the idea-4 header', () => {
  it.each(SUB_PAGES)('%s', (_name, file) => {
    const src = read(file);
    expect(src).toMatch(/<SubPageHeader\b/);
    expect(src).not.toContain('border-b border-border bg-card');
    expect(src).not.toMatch(/<UserMenu\b/);
    expect(src).not.toMatch(/bg-gradient-to-(br|r) from-primary/);
  });

  it('the header has one back link and no account menu', () => {
    const src = read('../components/SubPageHeader.tsx');
    expect(src.match(/<Link\b/g)).toHaveLength(1);
    expect(src).toContain('aria-label={`Back to ${backLabel}`}');
    expect(src).not.toMatch(/UserMenu|Womanie/);
  });
});
