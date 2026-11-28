import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthSecret: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn(), peekLimit: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn() } }));
vi.mock('jose', () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue('mock.jwt.token'),
  })),
}));

import handler, { DUMMY_HASH } from './login';
import { checkAndConsume, peekLimit } from '../../_lib/ratelimit.js';
import bcrypt from 'bcryptjs';

const STORED_USER = [{
  id: 'user_1',
  email: 'user@test.com',
  name: 'Test User',
  password_hash: '$2b$10$storedHash',
}];

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
    headers: {
      cookie: '',
      'x-forwarded-for': ip,
    },
    body: b,
    socket: { remoteAddress: ip },
  } as unknown as VercelRequest;
}

describe('auth/login security invariants', () => {
  beforeEach(() => {
    vi.mocked(checkAndConsume).mockReset().mockResolvedValue({ ok: true, remaining: 9, limit: 10, retryInSec: 0 });
    vi.mocked(peekLimit).mockReset().mockResolvedValue({ ok: true, remaining: 9, limit: 10, retryInSec: 0 });
    vi.mocked(bcrypt.compare).mockReset().mockResolvedValue(true as never);
    query.mockReset();
    query
      .mockResolvedValueOnce(STORED_USER) // SELECT auth_users
      .mockResolvedValueOnce([]);         // INSERT auth_sessions
  });

  it('returns 400 when email is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ password: 'pass1234' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 429 when the IP rate limit is exceeded', async () => {
    vi.mocked(checkAndConsume)
      .mockResolvedValueOnce({ ok: false, remaining: 0, limit: 10, retryInSec: 3600 })
      .mockResolvedValue({ ok: true, remaining: 9, limit: 10, retryInSec: 0 });
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(429);
    expect((res._body as Record<string, unknown>).retryInSec).toBe(3600);
  });

  it('returns 429 when the per-email rate limit is exceeded', async () => {
    vi.mocked(peekLimit).mockResolvedValueOnce({ ok: false, remaining: 0, limit: 10, retryInSec: 1800 });
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(429);
  });

  // Rate limiting must fire before the database is queried; otherwise an attacker
  // who hasn't exhausted the limit yet could still enumerate registered emails via
  // different response codes on the first attempt of each day.
  it('does not query the database when the rate limit fires', async () => {
    vi.mocked(checkAndConsume).mockResolvedValue({ ok: false, remaining: 0, limit: 10, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(429);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not query the database when the per-email limit fires', async () => {
    vi.mocked(peekLimit).mockResolvedValue({ ok: false, remaining: 0, limit: 10, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(429);
    expect(query).not.toHaveBeenCalled();
  });

  // Only failures use up the per-email allowance, so someone signing in on
  // several devices a day can never lock herself out.
  it('a successful sign-in does not count against the per-email limit', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'User@Test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(200);
    expect(vi.mocked(peekLimit)).toHaveBeenCalledWith('login-email', 'user@test.com', 30);
    const buckets = vi.mocked(checkAndConsume).mock.calls.map(c => c[0]);
    expect(buckets).toEqual(['login-ip']);
  });

  it('a wrong password counts once against the per-email limit', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const res = mockRes();
    await handler(mockReq({ email: 'User@Test.com', password: 'wrong_pass' }), res);
    expect(res._status).toBe(401);
    const emailCalls = vi.mocked(checkAndConsume).mock.calls.filter(c => c[0] === 'login-email');
    expect(emailCalls).toEqual([['login-email', 'user@test.com', 30]]);
  });

  it('an unknown email still runs a bcrypt compare (no timing difference) and counts as a failure', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const res = mockRes();
    await handler(mockReq({ email: 'nobody@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(401);
    expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith('pass1234', DUMMY_HASH);
    expect(vi.mocked(checkAndConsume).mock.calls.some(c => c[0] === 'login-email')).toBe(true);
  });

  it('returns 401 when the email is not registered', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ email: 'unknown@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(401);
  });

  it('returns 401 for a Google-only account with no password_hash', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ ...STORED_USER[0], password_hash: null }]);
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(401);
    expect((res._body as Record<string, string>).error).toMatch(/google/i);
  });

  it('returns 401 when the password is wrong', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'wrong_pass' }), res);
    expect(res._status).toBe(401);
  });

  // Documents that a session row is inserted in auth_sessions on every successful
  // login. Without this, getAuthUser's session-existence check (added 2026-10-25
  // to make logout truly revoke access) would reject every token, breaking login.
  it('inserts a session row into auth_sessions on success', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(200);
    const insertCall = query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && /INSERT INTO auth_sessions/i.test(c[0])
    );
    expect(insertCall).toBeDefined();
  });

  // The JWT must be delivered as an HttpOnly Secure cookie so JavaScript on the
  // page cannot steal it. If this flag were dropped via a copy-paste regression,
  // an XSS attack could exfiltrate the session token.
  it('sets the session cookie with HttpOnly and Secure flags', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(200);
    const cookie = res._headers['Set-Cookie'] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it('returns 200 with user info on successful login', async () => {
    const res = mockRes();
    await handler(mockReq({ email: 'user@test.com', password: 'pass1234' }), res);
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect((body.user as Record<string, string>).id).toBe('user_1');
  });
});
