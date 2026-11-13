import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query, transaction }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthSecret: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }));
vi.mock('jose', () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue('mock.jwt.token'),
  })),
}));

import handler from './signup';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import bcrypt from 'bcryptjs';

function mockRes() {
  let status = 200;
  const headers: Record<string, string> = {};
  const body: { _status: number; _body: unknown; _headers: Record<string, string> } & Partial<VercelResponse> = {
    _status: 200,
    _body: null,
    _headers: headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
      return body as unknown as VercelResponse;
    }) as VercelResponse['setHeader'],
    end: vi.fn() as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

function mockReq(b: unknown, ip = '1.2.3.4'): VercelRequest {
  return {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: b,
    socket: { remoteAddress: ip },
  } as unknown as VercelRequest;
}

describe('auth/signup security invariants', () => {
  beforeEach(() => {
    vi.mocked(checkAndConsume).mockReturnValue({ ok: true, remaining: 9, retryInSec: 0 });
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$10$hashedPassword' as never);
    query.mockReset();
    query.mockResolvedValue([]); // email pre-check: no conflict
    transaction.mockReset();
    transaction.mockResolvedValue([]);
  });

  it('returns 400 when email is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ password: 'password123' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'short' }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/8 character/i);
  });

  it('returns 429 when the IP rate limit is exceeded', async () => {
    vi.mocked(checkAndConsume).mockReturnValue({ ok: false, remaining: 0, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'password123' }), res);
    expect(res._status).toBe(429);
    expect((res._body as Record<string, unknown>).retryInSec).toBe(3600);
  });

  // Rate limiting must fire before the database is queried; otherwise an attacker
  // who hasn't exhausted the limit yet could still enumerate registered emails via
  // different response codes (409 vs 400) on the first attempt of each day.
  it('does not query the database when the rate limit fires', async () => {
    vi.mocked(checkAndConsume).mockReturnValue({ ok: false, remaining: 0, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'password123' }), res);
    expect(res._status).toBe(429);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 409 when the email is already registered (pre-check)', async () => {
    query.mockResolvedValue([{ id: 'user_existing' }]);
    const res = mockRes();
    await handler(mockReq({ email: 'taken@test.com', password: 'password123' }), res);
    expect(res._status).toBe(409);
    expect((res._body as Record<string, string>).error).toMatch(/already exists/i);
  });

  // TOCTOU: two concurrent requests can both pass the pre-check; the second hits
  // the unique constraint (Postgres error 23505) and must return 409, not 500.
  it('returns 409 on a unique-constraint violation (TOCTOU duplicate email)', async () => {
    transaction.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'password123' }), res);
    expect(res._status).toBe(409);
    expect((res._body as Record<string, string>).error).toMatch(/already exists/i);
  });

  // Documents the 2026-10-27 fix: all three inserts (auth_users, profiles,
  // auth_sessions) must commit together. If auth_users lands but auth_sessions
  // fails, the user's email is registered but their token would be rejected by
  // getAuthUser's session-existence check (added 2026-10-25), making the account
  // inaccessible without a re-registration path.
  it('wraps all three inserts inside a single transaction (atomicity guard)', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'password123' }), res);
    expect(transaction).toHaveBeenCalledOnce();
    const [txArgs] = transaction.mock.calls[0] as [unknown[]];
    expect(Array.isArray(txArgs)).toBe(true);
    expect(txArgs).toHaveLength(3);
  });

  // Documents that auth_sessions is included in the transaction. Without this row
  // the new user's session token is rejected on the very first authenticated request,
  // since getAuthUser verifies that the session id exists in auth_sessions.
  it('inserts a session row into auth_sessions inside the transaction', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'password123' }), res);
    // query calls: [0] SELECT (pre-check), [1] INSERT auth_users (tx arg),
    // [2] INSERT profiles (tx arg), [3] INSERT auth_sessions (tx arg)
    const sessionInsertSql = (query.mock.calls[3] as [string, unknown[]])[0];
    expect(sessionInsertSql).toMatch(/INSERT INTO auth_sessions/i);
  });

  // The JWT must be delivered as an HttpOnly Secure cookie so that JavaScript on
  // the page cannot steal it. If these flags were dropped via a copy-paste
  // regression, an XSS attack could exfiltrate the session token.
  it('sets the session cookie with HttpOnly and Secure flags', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'password123' }), res);
    expect(res._status).toBe(200);
    const cookie = res._headers['Set-Cookie'] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it('returns 200 with user info on successful signup', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'password123', name: 'Alice' }), res);
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(body.success).toBe(true);
    const user = body.user as Record<string, string>;
    expect(user.email).toBe('user@test.com');
  });
});
