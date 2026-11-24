import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// The Log sheet showed "Log today" and then the card's own "Today's Quick
// Log" right under it. The sheet title is the one heading now.
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const sheet = read('./LogSheet.tsx');
const log = read('./DailyLogging.tsx');

describe('Log sheet heading', () => {
  it('the sheet hides the card heading when the log comes first', () => {
    expect(sheet).toContain("'Log today'");
    expect(sheet).toContain('<DailyLogging selectedMode={mode} hideTitle={!medsFirst} />');
  });

  it("the card's heading is behind hideTitle", () => {
    expect(log).toContain("{!hideTitle && <h3 className=\"text-base font-semibold\">Today's Quick Log</h3>}");
  });
});
