import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { readFileSync } from 'node:fs';
import { scrubErrorEvent } from './sentryScrub';

// An unhandled promise rejection with a plain object (a failed /api/db
// answer, a row) reaches Sentry as extra.__serialized__ with every field.
// No health data or personal details may leave the device that way.

describe('client error payload scrubbing', () => {
  it('filters health fields in extra / contexts at any depth, keeps SDK contexts', () => {
    const ev = scrubErrorEvent({
      type: undefined,
      message: 'Non-Error promise rejection captured with keys: error, rows',
      extra: { __serialized__: { error: 'Database error', rows: [{ notes: 'spotting', value: 5.2 }], nested: { mood: ['sad'], status: 500 } } },
      contexts: { browser: { name: 'Safari' }, state: { medications: ['Letrozole'], route: '/dashboard' } },
      user: { id: 'u1', email: 'jane@example.com', ip_address: '1.2.3.4' },
    } as unknown as ErrorEvent);
    const s = JSON.stringify(ev);
    expect(s).not.toMatch(/spotting|5\.2|sad|Letrozole|jane@|1\.2\.3\.4/);
    expect((ev.extra as { __serialized__: { error: string; nested: { status: number } } }).__serialized__.error).toBe('Database error');
    expect((ev.extra as { __serialized__: { nested: { status: number } } }).__serialized__.nested.status).toBe(500);
    expect(ev.contexts?.browser).toEqual({ name: 'Safari' });
    expect(ev.user).toEqual({ id: 'u1' });
  });

  it('masks email addresses in the message and exception text', () => {
    const ev = scrubErrorEvent({
      type: undefined,
      message: 'login failed for jane@example.com',
      exception: { values: [{ type: 'Error', value: 'no account jane@example.com' }] },
    } as unknown as ErrorEvent);
    expect(ev.message).toBe('login failed for [email]');
    expect(ev.exception?.values?.[0].value).toBe('no account [email]');
  });

  it('unhandled rejections stay reported: the SDK default handlers are not switched off', () => {
    const src = readFileSync(new URL('./sentryClient.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/defaultIntegrations\s*:\s*false/);
    expect(src).not.toMatch(/onunhandledrejection\s*:\s*false/);
    expect(src).toMatch(/beforeSend: scrubErrorEvent/);
  });
});
