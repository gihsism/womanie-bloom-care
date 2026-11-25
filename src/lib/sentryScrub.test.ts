import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { readFileSync } from 'node:fs';
import { scrubBreadcrumb, scrubErrorEvent, scrubTransaction, stripUrl, type TransactionEvent } from './sentryScrub';

describe('client Sentry scrubbing', () => {
  it('strips query strings and fragments, keeps the path', () => {
    expect(stripUrl('https://womanie.info/dashboard/chat?q=endometriosis#x')).toBe('https://womanie.info/dashboard/chat');
    expect(stripUrl('/api/doctors/patient?id=u1')).toBe('/api/doctors/patient');
    expect(stripUrl('/plain')).toBe('/plain');
  });

  it('drops console breadcrumbs entirely', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'TSH 4.2 mIU/L', level: 'log' })).toBeNull();
  });

  it('strips fetch breadcrumb URL queries and any bodies', () => {
    const out = scrubBreadcrumb({
      category: 'fetch',
      data: { method: 'POST', url: '/api/db?table=medications', status_code: 200, body: '{"name":"Letrozole"}', request_body: 'x', response_body: 'y' },
    });
    expect(out?.data).toEqual({ method: 'POST', url: '/api/db', status_code: 200 });
  });

  it('strips navigation from/to queries', () => {
    const out = scrubBreadcrumb({ category: 'navigation', data: { from: '/a?x=1', to: '/b#frag' } });
    expect(out?.data).toEqual({ from: '/a', to: '/b' });
  });

  it('error events lose request body, query string, cookies and URL query; breadcrumbs scrubbed', () => {
    const ev = {
      type: undefined,
      request: { url: 'https://womanie.info/search?q=miscarriage', data: { a: 1 }, query_string: 'q=miscarriage', cookies: { s: 1 }, headers: { Referer: 'https://x/?q=1', 'User-Agent': 'ua' } },
      breadcrumbs: [
        { category: 'console', message: 'secret' },
        { category: 'xhr', data: { url: '/api/x?y=1' } },
      ],
    } as unknown as ErrorEvent;
    const out = scrubErrorEvent(ev);
    expect(out.request).toEqual({ url: 'https://womanie.info/search', headers: { 'User-Agent': 'ua' } });
    expect(out.breadcrumbs).toEqual([{ category: 'xhr', data: { url: '/api/x' } }]);
    expect(JSON.stringify(out)).not.toContain('miscarriage');
  });

  it('transactions lose span URL queries', () => {
    const ev = {
      type: 'transaction',
      transaction: '/dashboard?tab=labs',
      spans: [{ description: 'GET https://womanie.info/api/me/export?x=1', data: { url: 'https://womanie.info/api/me/export?x=1', 'http.query': '?x=1' } }],
    } as unknown as TransactionEvent;
    const out = scrubTransaction(ev);
    expect(out.transaction).toBe('/dashboard');
    expect(out.spans?.[0].description).toBe('GET https://womanie.info/api/me/export');
    expect(out.spans?.[0].data).toEqual({ url: 'https://womanie.info/api/me/export' });
  });

  it('Sentry.init (lib/monitoring.ts, started from main.tsx) wires the scrubbers in', () => {
    const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/initMonitoring\(import\.meta\.env\.VITE_SENTRY_DSN/);
    const src = readFileSync(new URL('./monitoring.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/beforeBreadcrumb:\s*scrub\.scrubBreadcrumb/);
    expect(src).toMatch(/beforeSend:\s*scrub\.scrubErrorEvent/);
    expect(src).toMatch(/beforeSendTransaction:\s*scrub\.scrubTransaction/);
    expect(src).toMatch(/sendDefaultPii:\s*false/);
  });
});
