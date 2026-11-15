import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthSecret: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('jose', () => ({
  jwtVerify: vi.fn().mockResolvedValue({ payload: { sub: 'u1', sid: 'sess_1', email: 'a@b.c', name: 'A' } }),
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue('fresh.jwt'),
  })),
}));

import handler from './me';

function run(expiresInDays: number) {
  const headers: Record<string, string> = {};
  let body: unknown = null;
  const res = {
    setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
    status: vi.fn(() => res), json: vi.fn((b: unknown) => { body = b; return res; }), end: vi.fn(),
  } as unknown as VercelResponse;
  query.mockImplementation(async (raw: unknown) => { const sql = String(raw ?? '');
    if (sql.startsWith('SELECT * FROM auth_sessions')) return [{ id: 'sess_1', expires_at: new Date(Date.now() + expiresInDays * 864e5).toISOString() }];
    if (sql.includes('password_hash')) return [{ has: true }];
    return [];
  });
  const req = { method: 'GET', headers: { cookie: 'womanie_session=old.jwt' } } as unknown as VercelRequest;
  return (handler as (q: VercelRequest, r: VercelResponse) => Promise<unknown>)(req, res).then(() => ({ headers, body }));
}

describe('GET /api/auth/me session renewal', () => {
  beforeEach(() => query.mockReset());

  it('renews a session with less than 20 days left (stays logged in)', async () => {
    const { headers, body } = await run(5);
    expect((body as { user: { id: string } }).user.id).toBe('u1');
    expect(query.mock.calls.some(c => String(c[0]).startsWith('UPDATE auth_sessions SET expires_at'))).toBe(true);
    expect(headers['Set-Cookie']).toMatch(/womanie_session=fresh\.jwt;.*Max-Age=2592000/);
  });

  it('leaves a fresh session alone', async () => {
    const { headers } = await run(28);
    expect(query.mock.calls.some(c => String(c[0]).startsWith('UPDATE'))).toBe(false);
    expect(headers['Set-Cookie']).toBeUndefined();
  });
});
