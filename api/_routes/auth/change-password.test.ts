import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query, transaction }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(), hash: vi.fn() } }));

import handler from './change-password';
import { getAuthUser } from '../../_lib/auth.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import bcrypt from 'bcryptjs';

const SESSION_USER = { id: 'user_1', email: 'user@test.com', sessionId: 'sess_current' };
const STORED_USER = [{ id: 'user_1', password_hash: '$2b$10$storedHash' }];

function mockRes() {
  let status = 200;
  const body: { _status: number; _body: unknown } & Partial<VercelResponse> = {
    _status: 200,
    _body: null,
    setHeader: vi.fn() as VercelResponse['setHeader'],
    end: vi.fn() as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

function mockReq(b: unknown): VercelRequest {
  return {
    method: 'POST',
    headers: { cookie: 'womanie_session=fake' },
    body: b,
  } as unknown as VercelRequest;
}

describe('auth/change-password security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    vi.mocked(checkAndConsume).mockReturnValue({ ok: true, remaining: 9, retryInSec: 0 });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$10$newHash' as never);
    query.mockReset();
    query.mockResolvedValue(STORED_USER);
    transaction.mockReset();
    transaction.mockResolvedValue([]);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'old_pass', newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(401);
  });

  it('returns 429 when the per-user rate limit is exceeded', async () => {
    vi.mocked(checkAndConsume).mockReturnValue({ ok: false, remaining: 0, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'old_pass', newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(429);
    expect((res._body as Record<string, string>).error).toMatch(/too many/i);
  });

  it('returns 400 when body fields are missing', async () => {
    const res = mockRes();
    await handler(mockReq({}), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when new password is shorter than 8 characters', async () => {
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'old_pass', newPassword: 'short' }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/8 character/i);
  });

  it('returns 400 when new password equals current password', async () => {
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'same_pass_123', newPassword: 'same_pass_123' }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/differ/i);
  });

  it('returns 404 when the account does not exist in the database', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'old_pass', newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(404);
  });

  it('lets a Google-only account (no password_hash) set its first password without a current one', async () => {
    query.mockResolvedValueOnce([{ id: 'user_1', password_hash: null }]).mockResolvedValueOnce([{ id: 'user_1' }]);
    const res = mockRes();
    await handler(mockReq({ newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(200);
    const [sqlText] = query.mock.calls[1];
    expect(sqlText).toMatch(/password_hash IS NULL/);
  });

  it('refuses to "set" a first password if one appeared meanwhile (race guard)', async () => {
    query.mockResolvedValueOnce([{ id: 'user_1', password_hash: null }]).mockResolvedValueOnce([]);
    const res = mockRes();
    await handler(mockReq({ newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(409);
  });

  it('still requires the current password when the account already has one', async () => {
    const res = mockRes();
    await handler(mockReq({ newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 401 when the current password is incorrect', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'wrong_pass', newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(401);
    expect((res._body as Record<string, string>).error).toMatch(/incorrect/i);
  });

  // Documents the 2026-11-03 fix: hash update and session revocation must commit
  // together. If the hash lands but the DELETE fails, an attacker holding a stolen
  // session retains access after the victim resets their password. Both writes now
  // run inside sql.transaction([...]) so they commit or roll back atomically.
  it('wraps hash update and session revocation inside a transaction (atomicity guard)', async () => {
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'old_pass', newPassword: 'new_pass_8' }), res);
    expect(transaction).toHaveBeenCalledOnce();
    // transaction receives an array of two pending query promises
    const [txArgs] = transaction.mock.calls[0] as [unknown[]];
    expect(Array.isArray(txArgs)).toBe(true);
    expect(txArgs).toHaveLength(2);
  });

  // Regression guard: the DELETE must scope to the session user AND exclude the
  // caller's own session so they stay signed in after the reset.
  it('DELETE SQL revokes other sessions but keeps the current one (id != sessionId)', async () => {
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'old_pass', newPassword: 'new_pass_8' }), res);
    // calls: [0] SELECT, [1] UPDATE (tx arg), [2] DELETE (tx arg)
    const deleteSql = (query.mock.calls[2] as [string, unknown[]])[0];
    const deleteParams = (query.mock.calls[2] as [string, unknown[]])[1];
    expect(deleteSql).toMatch(/DELETE\s+FROM\s+auth_sessions/i);
    expect(deleteSql).toMatch(/id\s*!=\s*\$2/i);
    expect(deleteParams).toContain(SESSION_USER.sessionId);
  });

  it('returns 200 on successful password change', async () => {
    const res = mockRes();
    await handler(mockReq({ currentPassword: 'old_pass', newPassword: 'new_pass_8' }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });
});
