import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// Vercel rejects the whole deploy (before building) when a function's
// includeFiles/excludeFiles glob is longer than 256 characters.
describe('vercel.json', () => {
  it('keeps every function glob within Vercel\'s 256-character limit', () => {
    const cfg = JSON.parse(readFileSync(process.cwd() + '/vercel.json', 'utf8'));
    for (const [name, fn] of Object.entries(cfg.functions ?? {}) as [string, Record<string, unknown>][]) {
      for (const key of ['includeFiles', 'excludeFiles']) {
        const v = fn[key];
        if (typeof v === 'string') expect(v.length, `${name}.${key}`).toBeLessThanOrEqual(256);
      }
    }
  });

  it('bundles the full-text passages with the AI chat', () => {
    const cfg = JSON.parse(readFileSync(process.cwd() + '/vercel.json', 'utf8'));
    expect(cfg.functions['api/ai-doctor-chat.ts'].includeFiles).toMatch(/fulltext-chunks\.json/);
  });
});
