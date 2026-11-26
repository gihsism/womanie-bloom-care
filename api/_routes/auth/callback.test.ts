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

  // Pre-account takeover: email+password signup never verifies the address,
  // so anyone can register victim@example.com with their own password
  // before the victim ever signs in. When the real owner later uses Google
  // (which has verified the address) and the account is linked, the
  // squatter's password and sessions must not survive the link.
  it('linking Google to an existing password account drops the unverified password and its sessions', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'g9', email: 'victim@example.com', verified_email: true, name: 'V' }) }) as unknown as typeof fetch;
    query.mockImplementation(async (sql: string) => {
      if (/WHERE google_id = \$1/.test(sql)) return [];
      if (/WHERE email = \$1/.test(sql)) return [{ id: 'user_sq', email: 'victim@example.com', name: 'Squatter', password_hash: '$2a$10$x', google_id: null }];
      return [];
    });
    transaction.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._redirect).toBe('/dashboard');
    const all = [...query.mock.calls, ...transaction.mock.calls.flat()].map(c => JSON.stringify(c));
    expect(all.some(s => /password_hash\s*=\s*NULL/i.test(s))).toBe(true);
    expect(all.some(s => /DELETE FROM auth_sessions WHERE user_id/.test(s) && s.includes('user_sq'))).toBe(true);
  });

  // Consent (2026-11-26): Google sign-up skips the form's privacy tick, so
  // the callback must NOT record a consent on her behalf. The new account
  // has no consent_log row, /api/auth/me reports consentRequired, and the
  // app shows the one-time consent screen on /welcome before anything else.
  it('a new Google account goes to /welcome with no consent recorded for her', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'gNew', email: 'new@example.com', verified_email: true, name: 'N' }) }) as unknown as typeof fetch;
    query.mockResolvedValue([]);
    transaction.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._redirect).toBe('/welcome');
    const all = [...query.mock.calls, ...transaction.mock.calls.flat()].map(c => JSON.stringify(c));
    expect(all.some(s => /consent_log/.test(s))).toBe(false);
  });
});
