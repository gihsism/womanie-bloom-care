import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './book';
import { getAuthUser } from '../../_lib/auth.js';

const SESSION_USER = { id: 'user_p1', email: 'p@test.com', sessionId: 'sess_1' };
const FUTURE = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
const DOCTOR_ROW = [{ user_id: 'doc_1', is_verified: true, is_available: true }];
const INSERTED_ROW = [{
  id: 'apt_1', scheduled_at: FUTURE, duration: 30,
  consultation_type: 'in_person', status: 'scheduled', payment_status: 'pending',
}];

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

describe('appointments/book security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    // Default success path: doctor lookup, conflict-guarded INSERT, non-fatal connection insert.
    query
      .mockResolvedValueOnce(DOCTOR_ROW)
      .mockResolvedValueOnce(INSERTED_ROW)
      .mockResolvedValueOnce([]);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(401);
  });

  it('returns 400 when doctor_id is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ scheduled_at: FUTURE }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when scheduled_at is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when scheduled_at is not a valid ISO timestamp', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: 'not-a-date' }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/not a valid/i);
  });

  it('returns 400 when scheduled_at is in the past', async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: past }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/past/i);
  });

  it('returns 400 when duration exceeds the 240-minute cap', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE, duration: 241 }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/duration/i);
  });

  it('returns 404 when the doctor does not exist', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_unknown', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(404);
  });

  it('returns 400 when the doctor is not verified', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ user_id: 'doc_1', is_verified: false, is_available: true }]);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/not currently bookable/i);
  });

  it('returns 400 when the doctor is marked unavailable', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ user_id: 'doc_1', is_verified: true, is_available: false }]);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/not currently available/i);
  });

  // Documents the 2026-10-25 conflict-guard design: two patients submitting the
  // same slot simultaneously both pass validation but only the first INSERT lands;
  // the second sees WHERE NOT EXISTS return empty and gets a clean 409. Without
  // this guard the unique-constraint-free table would silently store both rows.
  it('returns 409 when the slot is already taken (WHERE NOT EXISTS returns 0 rows)', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(DOCTOR_ROW);
    query.mockResolvedValueOnce([]);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(409);
    expect((res._body as Record<string, string>).error).toMatch(/slot was just taken/i);
  });

  // Regression guard: confirms the INSERT still carries the WHERE NOT EXISTS
  // overlap filter. A refactor that drops it re-enables silent double-booking.
  it('booking INSERT uses a WHERE NOT EXISTS overlap guard against the doctor calendar', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(200);
    const insertCalls = query.mock.calls.filter(([sql]: [string]) =>
      /INSERT INTO appointments/i.test(sql)
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    const [insertSql] = insertCalls[0] as [string, unknown[]];
    expect(insertSql).toMatch(/WHERE NOT EXISTS/i);
    expect(insertSql).toMatch(/doctor_id/i);
  });

  // Ownership invariant: the patient_id written into the row must come from
  // the authenticated session, not from client-supplied body values. If a
  // refactor accidentally trusts a body.patient_id, one user can book a slot
  // that records another user as the patient.
  it('INSERT binds the session user id as patient_id, never a client-supplied value', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    const insertCalls = query.mock.calls.filter(([sql]: [string]) =>
      /INSERT INTO appointments/i.test(sql)
    );
    const [, params] = insertCalls[0] as [string, unknown[]];
    // params[1] is $2 (patient_id) in the INSERT ... SELECT $1, $2, ...
    expect(params[1]).toBe(SESSION_USER.id);
  });

  it('returns 200 with the booked appointment on success', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).appointment).toBeTruthy();
  });
});
