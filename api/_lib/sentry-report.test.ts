import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// withSentry reports each failed request ONCE, names the API route (also
// for routes reached through api/router.ts), and carries no request data.

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
  init: vi.fn(),
}));
vi.mock('@sentry/node', () => sentry);

import { withSentry, routeName, ROUTE_KEY } from './sentry';

function res() {
  const r = { statusCode: 200 } as { statusCode: number } & Partial<VercelResponse>;
  r.status = (c: number) => { r.statusCode = c; return r as VercelResponse; };
  r.json = () => r as VercelResponse;
  return r as VercelResponse & { statusCode: number };
}
const req = (url: string, extra: Record<string | symbol, unknown> = {}) =>
  ({ url, method: 'POST', query: {}, headers: {}, body: { notes: 'heavy bleeding' }, ...extra }) as unknown as VercelRequest;

beforeEach(() => {
  sentry.captureException.mockReset();
  sentry.captureMessage.mockReset();
});

describe('routeName', () => {
  it('uses the router tag, then __route, then the path; never the query', () => {
    expect(routeName(req('/api/router?__route=db', { [ROUTE_KEY]: 'db' }))).toBe('db');
    expect(routeName(req('/api/router', { query: { __route: 'auth/me' } }))).toBe('auth/me');
    expect(routeName(req('/api/upload?token=secret'))).toBe('upload');
    expect(routeName(req(''))).toBe('unknown');
  });
});

describe('withSentry reporting', () => {
  it('a handled 500 is reported once, by route, grouped per route+status, with no body', async () => {
    const h = withSentry((_q, s) => s.status(500).json({ error: 'Database error' }));
    await h(req('/api/router?__route=db&x=1', { [ROUTE_KEY]: 'db' }), res());
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [msg, ctx] = sentry.captureMessage.mock.calls[0];
    expect(msg).toBe('Handled HTTP 500: POST /api/db');
    expect(ctx.tags.route).toBe('db');
    expect(ctx.fingerprint).toEqual(['api-5xx', 'db', '500']);
    expect(JSON.stringify(sentry.captureMessage.mock.calls)).not.toMatch(/bleeding|x=1/);
  });

  it('a thrown error after a 500 status is reported once (as the exception), not twice', async () => {
    const h = withSentry((_q, s) => { s.status(500); throw new Error('boom'); });
    await expect(h(req('/api/upload'), res())).rejects.toThrow('boom');
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException.mock.calls[0][1].tags.route).toBe('upload');
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('4xx answers and successes are not reported', async () => {
    await withSentry((_q, s) => s.status(400).json({}))(req('/api/db'), res());
    await withSentry((_q, s) => s.status(200).json({}))(req('/api/db'), res());
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});
