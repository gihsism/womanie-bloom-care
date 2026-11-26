import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query, transaction }) }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn() }));
vi.mock('../../_lib/notify.js', () => ({ notifyAdmin: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }));

import handler from './doctor-signup';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import bcrypt from 'bcryptjs';

function mockRes() {
  let status = 200;
  const headers: Record<string, string | string[]> = {};
  const body: { _status: number; _body: unknown; _headers: Record<string, string | string[]> } & Partial<VercelResponse> = {
    _status: 200,
    _body: null,
    _headers: headers,
    setHeader: vi.fn((name: string, value: string | string[]) => {
      headers[name] = value;
      return body as unknown as VercelResponse;
    }) as VercelResponse['setHeader'],
    end: vi.fn(() => body as unknown as VercelResponse) as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

function mockReq(b: unknown, method = 'POST', ip = '1.2.3.4'): VercelRequest {
  return {
    method,
    headers: { 'x-forwarded-for': ip },
    body: b,
    socket: { remoteAddress: ip },
  } as unknown as VercelRequest;
}

const VALID_BODY = {
  email: 'doctor@clinic.com',
  password: 'password123',
  fullName: 'Dr. Alice Smith',
  licenseNumber: 'MD-12345',
  specialty: 'Gynecology',
};

describe('auth/doctor-signup security invariants', () => {
  beforeEach(() => {
    vi.mocked(checkAndConsume).mockResolvedValue({ ok: true, remaining: 9, limit: 10, retryInSec: 0 });
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$10$hashedPassword' as never);
    query.mockReset();
    query.mockResolvedValue([]); // email pre-check: no conflict
    transaction.mockReset();
    transaction.mockResolvedValue([]);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq(VALID_BODY, 'GET'), res);
    expect(res._status).toBe(405);
  });

  it('returns 400 when email is missing', async () => {
    const { email: _e, ...body } = VALID_BODY;
    const res = mockRes();
    await handler(mockReq(body), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const { password: _p, ...body } = VALID_BODY;
    const res = mockRes();
    await handler(mockReq(body), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when fullName is missing', async () => {
    const { fullName: _n, ...body } = VALID_BODY;
    const res = mockRes();
    await handler(mockReq(body), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when licenseNumber is missing', async () => {
    const { licenseNumber: _l, ...body } = VALID_BODY;
    const res = mockRes();
    await handler(mockReq(body), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = mockRes();
    await handler(mockReq({ ...VALID_BODY, password: 'short' }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/8 character/i);
  });

  it('returns 429 when the IP rate limit is exceeded', async () => {
    vi.mocked(checkAndConsume).mockResolvedValue({ ok: false, remaining: 0, limit: 10, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(res._status).toBe(429);
    expect((res._body as Record<string, unknown>).retryInSec).toBe(3600);
  });

  // Rate limiting must fire before the database is queried; otherwise an attacker
  // who hasn't exhausted the limit yet could enumerate registered emails via
  // different response codes (409 vs 400) before the counter saturates.
  it('does not query the database when the rate limit fires', async () => {
    vi.mocked(checkAndConsume).mockResolvedValue({ ok: false, remaining: 0, limit: 10, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(res._status).toBe(429);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 409 when the email is already registered (pre-check)', async () => {
    query.mockResolvedValue([{ id: 'user_existing' }]);
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(res._status).toBe(409);
    expect((res._body as Record<string, string>).error).toMatch(/already exists/i);
  });

  // TOCTOU: two concurrent requests can both pass the pre-check; the second hits
  // the unique constraint (Postgres error 23505) and must return 409, not 500.
  it('returns 409 on a unique-constraint violation (TOCTOU duplicate email)', async () => {
    transaction.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(res._status).toBe(409);
    expect((res._body as Record<string, string>).error).toMatch(/already exists/i);
  });

  // Both inserts (auth_users + doctor_profiles) must commit together. If
  // auth_users lands but doctor_profiles fails the email is taken but no doctor
  // profile exists — re-registration is blocked and the account is unusable.
  it('wraps both inserts inside a single transaction (atomicity guard)', async () => {
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(transaction).toHaveBeenCalledOnce();
    const [txArgs] = transaction.mock.calls[0] as [unknown[]];
    expect(Array.isArray(txArgs)).toBe(true);
    // exactly 2: auth_users + doctor_profiles — no auth_sessions (deliberate)
    expect(txArgs).toHaveLength(2);
  });

  // Critical security invariant: doctor signup must NEVER insert into user_roles.
  // Admin approval (via /admin/doctors) is the only path to the 'doctor' role.
  // A regression granting the role here would let anyone with a license number
  // string bypass the license-review gate and read patient chart data.
  it('never inserts into user_roles (admin approval is required before role is granted)', async () => {
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(res._status).toBe(200);
    const allSql = (query.mock.calls as Array<[string, ...unknown[]]>)
      .map(([sql]) => sql)
      .join('\n');
    expect(allSql).not.toMatch(/user_roles/i);
  });

  // Critical security invariant: doctor signup must NOT set a session cookie.
  // The doctor is shown a "pending verification" screen and cannot log in until
  // an admin approves them. A regression that issued a session here would let an
  // unverified (or fraudulent) doctor authenticate against the system before review.
  it('does not set a session cookie on success', async () => {
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(res._status).toBe(200);
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('returns 200 with success: true and pending: true on success', async () => {
    const res = mockRes();
    await handler(mockReq(VALID_BODY), res);
    expect(res._status).toBe(200);
    const b = res._body as Record<string, unknown>;
    expect(b.success).toBe(true);
    expect(b.pending).toBe(true);
  });
});

describe('auth/doctor-signup with a one-time invite', () => {
  const TOKEN = 'A'.repeat(43);
  const INVITE = { id: 'inv_1', email: 'doctor@clinic.com', created_by: 'admin_1', created_by_email: 'founder@womanie.info' };

  beforeEach(() => {
    process.env.AUTH_SECRET = 'x'.repeat(40);
    vi.mocked(checkAndConsume).mockResolvedValue({ ok: true, remaining: 9, limit: 10, retryInSec: 0 });
    vi.mocked(bcrypt.hash).mockResolvedValue('$2b$10$hashedPassword' as never);
    query.mockReset();
    query.mockImplementation(async (text: string) => (/FROM doctor_invites/.test(text) ? [INVITE] : []));
    transaction.mockReset();
    transaction.mockResolvedValue([]);
  });

  const sqls = () => query.mock.calls.map((c: unknown[]) => String(c[0]));

  it('creates an approved doctor, signs her in, and sends her to the dashboard', async () => {
    const res = mockRes();
    await handler(mockReq({ ...VALID_BODY, inviteToken: TOKEN }), res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ success: true, pending: false, redirect: '/doctor/dashboard' });
    expect(String(res._headers['Set-Cookie'])).toMatch(/^womanie_session=/);
    expect(transaction).toHaveBeenCalledOnce();
    const all = sqls();
    expect(all.some(s => /INSERT INTO doctor_profiles/.test(s) && /true, 'approved'/.test(s))).toBe(true);
    expect(all.some(s => /INSERT INTO user_roles/.test(s))).toBe(true);
    expect(all.some(s => /INSERT INTO admin_audit_log/.test(s))).toBe(true);
  });

  // Single use: the FIRST statement of the transaction consumes the invite
  // and divides by the rows it changed, so a second use rolls everything back.
  it('consumes the invite inside the same transaction, first', async () => {
    await handler(mockReq({ ...VALID_BODY, inviteToken: TOKEN }), mockRes());
    const calls = query.mock.calls as unknown[][];
    const i = calls.findIndex(c => /UPDATE doctor_invites/.test(String(c[0])));
    const consume = String(calls[i][0]);
    expect(consume).toMatch(/UPDATE doctor_invites SET used_at = now\(\)/);
    expect(consume).toMatch(/used_at IS NULL AND revoked_at IS NULL AND expires_at > now\(\)/);
    expect(consume).toMatch(/1 \/ \(SELECT count\(\*\)/);
    expect(String(calls[i + 1][0])).toMatch(/INSERT INTO auth_users/);
  });

  it('answers 410 when the invite was used in a race (division_by_zero rollback)', async () => {
    transaction.mockRejectedValue(Object.assign(new Error('division by zero'), { code: '22012' }));
    const res = mockRes();
    await handler(mockReq({ ...VALID_BODY, inviteToken: TOKEN }), res);
    expect(res._status).toBe(410);
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('answers 410 for a used / expired / revoked invite', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ ...VALID_BODY, inviteToken: TOKEN }), res);
    expect(res._status).toBe(410);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses a different email than the one invited', async () => {
    const res = mockRes();
    await handler(mockReq({ ...VALID_BODY, email: 'other@clinic.com', inviteToken: TOKEN }), res);
    expect(res._status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses a malformed token', async () => {
    const res = mockRes();
    await handler(mockReq({ ...VALID_BODY, inviteToken: 'short' }), res);
    expect(res._status).toBe(410);
    expect(transaction).not.toHaveBeenCalled();
  });
});
