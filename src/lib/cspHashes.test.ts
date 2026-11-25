import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// The enforced Content-Security-Policy (vercel.json) allows inline scripts
// only by hash. Any edit to an inline <script> in index.html must update
// the hash, or the browser silently blocks it (night mode before first
// paint, the early session check).
const root = resolve(__dirname, '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const vercel = readFileSync(resolve(root, 'vercel.json'), 'utf8');

describe('CSP hashes', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

  it('index.html has inline scripts to check', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(scripts.map((s, i) => [i, s] as const))('inline script %i is allowed by vercel.json', (_i, body) => {
    const hash = createHash('sha256').update(body, 'utf8').digest('base64');
    expect(vercel).toContain(`'sha256-${hash}'`);
  });
});
