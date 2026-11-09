import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn() }));

import handler from './redeem-code';
import { getAuthUser } from '../../_lib/auth.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';

const SESSION_USER = { id: 'user_doctor1', email: 'doc@test.com', sessionId: 'sess_1' };
const DOCTOR_ROLE = [{ role: 'doctor' }];
const SUCCESS_CLAIM = [{ claimed: 1 }];
const NO_CLAIM = [{ claimed: 0 }];

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

describe('connections/redeem-code security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    vi.mocked(checkAndConsume).mockReturnValue({ ok: true, remaining: 19, retryInSec: 0 });
    query.mockReset();
    // Default happy path: role check → doctor role; CTE → claimed=1
    query.mockResolvedValueOnce(DOCTOR_ROLE).mockResolvedValueOnce(SUCCESS_CLAIM);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ code: 'ABC123' }), res);
    expect(res._status).toBe(401);
  });

  it('returns 400 when code is missing from the body', async () => {
    const res = mockRes();
    await handler(mockReq({}), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when code is a whitespace-only string', async () => {
    const res = mockRes();
    await handler(mockReq({ code: '   ' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 429 when the rate limit fires', async () => {
    vi.mocked(checkAndConsume).mockReturnValue({ ok: false, remaining: 0, retryInSec: 3600 });
    const res = mockRes();
    await handler(mockReq({ code: 'ABC123' }), res);
    expect(res._status).toBe(429);
  });

  it('returns 403 when the caller does not hold the doctor role', async () => {
    // A patient account with no roles must never be able to redeem codes:
    // granting them access would skip the doctor-verification gate entirely.
    query.mockReset();
    query.mockResolvedValueOnce([]); // no role rows
    const res = mockRes();
    await handler(mockReq({ code: 'ABC123' }), res);
    expect(res._status).toBe(403);
    expect((res._body as Record<string, string>).error).toMatch(/doctor/i);
  });

  it('returns 403 when the caller has a non-doctor role', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ role: 'admin' }]); // wrong role
    const res = mockRes();
    await handler(mockReq({ code: 'ABC123' }), res);
    expect(res._status).toBe(403);
  });

  it('returns 404 when the code is invalid, expired, or already used', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(DOCTOR_ROLE).mockResolvedValueOnce(NO_CLAIM);
    const res = mockRes();
    await handler(mockReq({ code: 'BADCODE' }), res);
    expect(res._status).toBe(404);
  });

  it('returns 409 when already connected to this patient (unique constraint)', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(DOCTOR_ROLE);
    query.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const res = mockRes();
    await handler(mockReq({ code: 'ABC123' }), res);
    expect(res._status).toBe(409);
    expect((res._body as Record<string, string>).error).toMatch(/already connected/i);
  });

  it('returns 200 with success on valid code redemption', async () => {
    const res = mockRes();
    await handler(mockReq({ code: 'ABC123' }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });

  // The next two are regression guards: if someone removes the WHERE conditions
  // from the CTE UPDATE, used or expired codes would start working again.
  it('atomic CTE SQL checks is_used = false (prevents reuse of already-burned codes)', async () => {
    const res = mockRes();
    await handler(mockReq({ code: 'REDEEMME' }), res);
    const cteSql = query.mock.calls[1]?.[0] as string;
    expect(cteSql).toMatch(/is_used\s*=\s*false/i);
  });

  it('atomic CTE SQL checks expires_at > now() (prevents expired codes from working)', async () => {
    const res = mockRes();
    await handler(mockReq({ code: 'REDEEMME' }), res);
    const cteSql = query.mock.calls[1]?.[0] as string;
    expect(cteSql).toMatch(/expires_at\s*>\s*now\(\)/i);
  });

  it('connection is inserted as status=pending, not approved (patient must still consent)', async () => {
    // A doctor redeeming a code must NOT gain immediate chart access —
    // the patient controls approval from PendingConnections. If the
    // INSERT ever used 'approved' instead of 'pending', chart data would
    // be exposed without the patient's explicit consent.
    const res = mockRes();
    await handler(mockReq({ code: 'REDEEMME' }), res);
    const cteSql = query.mock.calls[1]?.[0] as string;
    expect(cteSql).toMatch(/'pending'/i);
    expect(cteSql).not.toMatch(/'approved'/i);
  });
});
