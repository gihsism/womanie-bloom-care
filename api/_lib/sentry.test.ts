import { describe, it, expect } from 'vitest';
import { scrubEvent } from './sentry';

describe('scrubEvent', () => {
  it('drops request bodies, cookies and auth headers before an event leaves', () => {
    const event = {
      message: 'Handled HTTP 500',
      request: {
        url: '/api/ai-doctor-chat',
        data: { messages: [{ role: 'user', content: 'my AMH is 0.4' }] },
        cookies: { womanie_session: 'jwt' },
        headers: { Cookie: 'womanie_session=jwt', authorization: 'Bearer x', 'user-agent': 'ua' } as Record<string, string>,
      },
    };
    const out = scrubEvent(event);
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toEqual({ 'user-agent': 'ua' });
    expect((out.request as { url?: string }).url).toBe('/api/ai-doctor-chat');
  });
  it('passes events without a request through unchanged', () => {
    const event: { message: string; request?: undefined } = { message: 'x' };
    expect(scrubEvent(event)).toEqual({ message: 'x' });
  });
});

describe('scrubEvent: health fields, secrets and URLs (server contract)', () => {
  it('strips query strings, secret headers and everything but the user id', () => {
    const out = scrubEvent({
      request: {
        url: 'https://womanie.info/api/router?__route=docs/file&id=abc',
        query_string: 'id=abc',
        headers: { 'x-api-key': 'sk-ant', 'x-forwarded-for': '1.2.3.4', referer: 'https://womanie.info/dashboard?q=amh', accept: 'json' } as Record<string, string>,
      },
      user: { id: 'user_1', email: 'her@mail.ch', ip_address: '1.2.3.4' },
    });
    expect(out.request?.url).toBe('https://womanie.info/api/router');
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.headers).toEqual({ accept: 'json' });
    expect(out.user).toEqual({ id: 'user_1' });
  });

  it('filters health fields at any depth in extra/contexts, keeps SDK contexts', () => {
    const out = scrubEvent({
      extra: { row: { test_name: 'AMH', value: 0.4, unit: 'ng/mL', id: 'r1' }, rows: [{ symptoms: ['cramps'] }], count: 3 },
      contexts: { os: { name: 'Linux' }, payload: { period_start_date: '2026-11-01', medication: 'Letrozole' } },
      tags: { path: '/api/x?email=a@b.ch', method: 'GET', email: 'a@b.ch' },
    });
    expect(out.extra).toEqual({ row: { test_name: '[Filtered]', value: '[Filtered]', unit: '[Filtered]', id: 'r1' }, rows: [{ symptoms: '[Filtered]' }], count: 3 });
    expect(out.contexts).toEqual({ os: { name: 'Linux' }, payload: { period_start_date: '[Filtered]', medication: '[Filtered]' } });
    expect(out.tags).toEqual({ path: '/api/x', method: 'GET', email: '[Filtered]' });
  });

  it('drops console breadcrumbs, cuts breadcrumb URLs, masks emails in messages and exceptions', () => {
    const out = scrubEvent({
      message: 'duplicate key: Key (email)=(her@mail.ch) already exists',
      exception: { values: [{ value: 'insert failed for her@mail.ch' }] },
      breadcrumbs: [
        { category: 'console', message: 'Anthropic error: my AMH is 0.4' },
        { category: 'http', message: 'GET https://api/x?token=1', data: { url: 'https://api/x?token=1', body: '{"content":"x"}', status_code: 500 } },
      ],
    });
    expect(out.message).toBe('duplicate key: Key (email)=([email]) already exists');
    expect(out.exception?.values?.[0].value).toBe('insert failed for [email]');
    expect(out.breadcrumbs).toEqual([
      { category: 'http', message: 'GET https://api/x', data: { url: 'https://api/x', body: '[Filtered]', status_code: 500 } },
    ]);
  });

  it('is wired as beforeSend AND beforeSendTransaction', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./sentry.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/beforeSend: scrubEvent/);
    expect(src).toMatch(/beforeSendTransaction: scrubEvent/);
    expect(src).toMatch(/sendDefaultPii: false/);
  });
});
