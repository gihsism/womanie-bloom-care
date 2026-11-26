import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({ query, transaction: (qs: Promise<unknown>[]) => Promise.all(qs) }),
}));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './reschedule';
import { getAuthUser } from '../../_lib/auth.js';
import { wallTimeToUtc } from '../../_lib/practice-time.js';

const SESSION_USER = { id: 'user_p1', email: 'p@test.com', sessionId: 'sess_1' };
// Tuesday 2099-01-06 10:00 Swiss time, inside the doctor's Tuesday hours.
const FUTURE = wallTimeToUtc(2099, 1, 6, 10, 0).toISOString();
const SCHEDULE = [{ day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_active: true }];
const LOCK = [{ pg_advisory_xact_lock: '' }];

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

const SCHEDULED_APT = [{ id: 'apt_1', doctor_id: 'doc_1', duration: 30, status: 'scheduled', schedule: SCHEDULE }];
const UPDATED_APT = [{ id: 'apt_1', scheduled_at: FUTURE, duration: 30, consultation_type: 'in_person', status: 'scheduled' }];

describe('appointments/reschedule security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    // Default success path: ownership SELECT returns scheduled apt, UPDATE succeeds.
    query.mockResolvedValueOnce(SCHEDULED_APT).mockResolvedValueOnce(LOCK).mockResolvedValueOnce(UPDATED_APT);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(401);
  });

  it('refuses to move a visit while the doctor has paused bookings, and changes nothing', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ ...SCHEDULED_APT[0], bookings_on: false }]);
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).code).toBe('bookings_off');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['apt_1', 'user_p1']);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = mockRes();
    await handler(mockReq({}), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when scheduled_at is not a valid ISO timestamp', async () => {
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: 'not-a-date' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when scheduled_at is in the past', async () => {
    const past = new Date(Date.now() - 3600_000).toISOString();
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: past }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/past/i);
  });

  it('returns 404 when the appointment does not belong to the session user', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_other', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(404);
  });

  it('returns 400 when the appointment is not in scheduled state', async () => {
    query.mockReset();
    query.mockResolvedValue([{ id: 'apt_1', doctor_id: 'doc_1', duration: 30, status: 'cancelled' }]);
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/cancelled/i);
  });

  // Documents the 2026-11-05 fix: a concurrent cancel between the ownership SELECT
  // and the UPDATE would previously leave a cancelled appointment with a new time and
  // return 200. The UPDATE WHERE clause now re-verifies status atomically, so 0 rows
  // returned means 409 regardless of whether it was a slot conflict or a status change.
  it('returns 409 when UPDATE returns 0 rows (slot taken or status changed atomically)', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(SCHEDULED_APT); // ownership SELECT passes
    query.mockResolvedValueOnce(LOCK);
    query.mockResolvedValueOnce([]);             // UPDATE finds no matching row
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(409);
  });

  // Regression guard: confirms the UPDATE WHERE clause re-checks status so a
  // "simplify the query" refactor can't silently drop the atomic TOCTOU guard.
  it('UPDATE SQL includes atomic status re-check to prevent TOCTOU with concurrent cancel', async () => {
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    const [updateSql] = query.mock.calls[2] as [string, unknown[]];
    expect(updateSql).toMatch(/COALESCE\(status,\s*'scheduled'\)\s*=\s*'scheduled'/i);
  });

  it('returns 200 with the rescheduled appointment on success', async () => {
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).appointment).toBeTruthy();
  });

  it('refuses a time outside the doctor\'s opening hours (Swiss time)', async () => {
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: wallTimeToUtc(2099, 1, 6, 3, 0).toISOString() }), res);
    expect(res._status).toBe(400);
    expect(query.mock.calls.some(c => /^\s*UPDATE appointments/.test(c[0] as string))).toBe(false);
  });

  it('moves the visit behind the per-doctor advisory lock', async () => {
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    expect(query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock/);
    expect(query.mock.calls[1][1]).toEqual(['appointments:doc_1']);
  });

  it('a unique-index clash (23505) is a clean 409', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(SCHEDULED_APT).mockResolvedValueOnce(LOCK)
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = mockRes();
    await handler(mockReq({ appointment_id: 'apt_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(409);
  });
});
