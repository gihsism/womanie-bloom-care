import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// Guards the security headers in vercel.json. The CSP allows the one inline
// <script> in index.html (the early /api/auth/me fetch) by its sha256, so
// editing that script without updating the hash would block it once the
// policy is enforced. This test fails first.

const root = resolve(__dirname, '../..');
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const global = vercel.headers.find(h => h.source === '/(.*)');
const header = (key: string) => global?.headers.find(h => h.key === key)?.value ?? '';

describe('vercel.json security headers', () => {
  it('sets the baseline headers on every path', () => {
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d{8}/);
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(header('Content-Security-Policy')).toContain("object-src 'none'");
    // Pages opened from Womanie (or that open it) can't reach its window.
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('API responses (health documents included) may only be loaded by Womanie itself', () => {
    const api = vercel.headers.find(h => h.source === '/api/(.*)');
    expect(api?.headers.find(h => h.key === 'Cross-Origin-Resource-Policy')?.value).toBe('same-origin');
  });

  it("allows index.html's inline scripts by hash (and nothing inline otherwise)", () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    const csp = header('Content-Security-Policy');
    const scriptSrc = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src')) ?? '';
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    for (const body of inline) {
      const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
      expect(scriptSrc, 'update the CSP hash in vercel.json after editing the inline script in index.html').toContain(hash);
    }
  });
});
