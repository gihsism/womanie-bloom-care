import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query, transaction }) }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './callback';

function mockRes() {
  const r = { _redirect: '' as string, setHeader: vi.fn() } as unknown as VercelResponse & { _redirect: string };
  (r as unknown as { redirect: (code: number, to: string) => unknown }).redirect = (_c: number, to: string) => {
    r._redirect = to;
    return r;
  };
  return r;
}

function mockReq(): VercelRequest {
  return {
    method: 'GET',
    query: { code: 'c', state: 'st' },
    headers: { cookie: 'womanie_oauth_state=st' },
  } as unknown as VercelRequest;
}

describe('auth/callback', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.AUTH_SECRET = 'x'.repeat(40);
    query.mockReset();
    transaction.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('refuses a Google account whose email is not verified (no lookup, no link)', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'g1', email: 'victim@example.com', verified_email: false }) }) as unknown as typeof fetch;
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._redirect).toBe('/auth/login?error=unverified_email');
    expect(query).not.toHaveBeenCalled();
  });

  it('signs in a verified Google account', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'g1', email: 'a@example.com', verified_email: true, name: 'A' }) }) as unknown as typeof fetch;
    query.mockResolvedValueOnce([{ id: 'user_1', email: 'a@example.com', name: 'A' }]).mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._redirect).toBe('/dashboard');
  });
});
