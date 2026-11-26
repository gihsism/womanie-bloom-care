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
import { POLICY_VERSIONS } from '../../_lib/policy-versions';

const CURRENT = POLICY_VERSIONS.privacy_policy!.version;

function run(expiresInDays: number, profileName: string | null = null, consentRows: Array<{ version: string }> | Error = [{ version: CURRENT }]) {
  const headers: Record<string, string> = {};
  let body: unknown = null;
  const res = {
    setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
    status: vi.fn(() => res), json: vi.fn((b: unknown) => { body = b; return res; }), end: vi.fn(),
  } as unknown as VercelResponse;
  query.mockImplementation(async (raw: unknown) => { const sql = String(raw ?? '');
    if (sql.startsWith('SELECT * FROM auth_sessions')) return [{ id: 'sess_1', expires_at: new Date(Date.now() + expiresInDays * 864e5).toISOString() }];
    if (sql.includes('password_hash')) return [{ has: true }];
    if (sql.includes('FROM profiles')) return [{ full_name: profileName }];
    if (sql.includes('FROM consent_log')) { if (consentRows instanceof Error) throw consentRows; return consentRows; }
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

  it('returns the name saved on the profile over the signup name in the JWT', async () => {
    const { body } = await run(28, 'Lena');
    expect((body as { user: { name: string } }).user.name).toBe('Lena');
  });

  it('falls back to the JWT name when the profile has none', async () => {
    const { body } = await run(28, null);
    expect((body as { user: { name: string } }).user.name).toBe('A');
  });
});

// Consent gate (2026-11-26): /me tells the app whether to show the one-time
// privacy screen. These cover the Google paths: a new Google account and an
// existing account never have a signup consent row; the email path always
// has one (written in the signup transaction).
describe('GET /api/auth/me privacy consent status', () => {
  beforeEach(() => query.mockReset());
  type U = { user: { consentRequired: boolean; consentReason: string | null; privacyPolicyVersion: string } };

  it('email sign-up (row for the current version): no consent screen', async () => {
    const { body } = await run(28, null, [{ version: CURRENT }]);
    expect((body as U).user).toMatchObject({ consentRequired: false, consentReason: null, privacyPolicyVersion: CURRENT });
  });

  it('new Google account / existing account without a row: consent screen, reason "new"', async () => {
    const { body } = await run(28, null, []);
    expect((body as U).user).toMatchObject({ consentRequired: true, consentReason: 'new' });
  });

  it('version bump: a row only for an older version asks again, reason "updated"', async () => {
    const { body } = await run(28, null, [{ version: '2000-01-01' }]);
    expect((body as U).user).toMatchObject({ consentRequired: true, consentReason: 'updated' });
  });

  it('looks up only this user and only the privacy policy', async () => {
    await run(28);
    const call = query.mock.calls.find(c => String(c[0]).includes('FROM consent_log'))!;
    expect(String(call[0])).toMatch(/document = 'privacy_policy'/);
    expect(call[1]).toEqual(['u1']);
  });

  it('a failed lookup never logs her out (session stays valid, no screen this time)', async () => {
    const { body } = await run(28, null, new Error('db down'));
    expect((body as U).user).toMatchObject({ consentRequired: false });
  });
});
