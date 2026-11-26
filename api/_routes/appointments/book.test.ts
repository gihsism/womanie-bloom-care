import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({ query, transaction: (qs: Promise<unknown>[]) => Promise.all(qs) }),
}));
const sendPush = vi.fn();
vi.mock('../../_lib/push-send.js', async (orig) => ({ ...(await orig<object>()), sendPush: (...a: unknown[]) => sendPush(...a) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './book';
import { getAuthUser } from '../../_lib/auth.js';
import { wallTimeToUtc } from '../../_lib/practice-time.js';

const SESSION_USER = { id: 'user_p1', email: 'p@test.com', sessionId: 'sess_1' };
// Tuesday 2099-01-06 10:00 Swiss time, inside the doctor's Tuesday hours.
const FUTURE = wallTimeToUtc(2099, 1, 6, 10, 0).toISOString();
const SCHEDULE = [{ day_of_week: 2, start_time: '09:00:00', end_time: '17:00:00', is_active: true }];
const DOCTOR_ROW = [{
  user_id: 'doc_1', is_verified: true, is_available: true,
  consultation_duration: 30, video_enabled: true, schedule: SCHEDULE,
}];
const LOCK = [{ pg_advisory_xact_lock: '' }];
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
    // Default success path: doctor lookup, advisory lock, conflict-guarded
    // INSERT, non-fatal connection insert.
    query
      .mockResolvedValueOnce(DOCTOR_ROW)
      .mockResolvedValueOnce(LOCK)
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
    query.mockResolvedValueOnce([{ ...DOCTOR_ROW[0], is_verified: false }]);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/not currently bookable/i);
  });

  it('returns 400 when the doctor is marked unavailable', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ ...DOCTOR_ROW[0], is_available: false }]);
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
    query.mockResolvedValueOnce(LOCK);
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
    const insertCalls = query.mock.calls.filter(([sql]) =>
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
    const insertCalls = query.mock.calls.filter(([sql]) =>
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

  it('refuses when "Accept new bookings" was never switched on (no settings row)', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ ...DOCTOR_ROW[0], is_available: null }]);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(400);
  });

  it('refuses a time outside the opening hours, read in Swiss time', async () => {
    const res = mockRes();
    // 08:30 Zurich: before the 09:00 opening even though it is 07:30 UTC.
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: wallTimeToUtc(2099, 1, 6, 8, 30).toISOString() }), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/opening hours/i);
    expect(query.mock.calls.some(c => /INSERT INTO appointments/.test(c[0] as string))).toBe(false);
  });

  it('refuses a visit that would run past closing time', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: wallTimeToUtc(2099, 1, 6, 16, 45).toISOString() }), res);
    expect(res._status).toBe(400);
  });

  it('uses the doctor\'s visit length, not the client\'s', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE, duration: 5 }), res);
    const insert = query.mock.calls.find(c => /INSERT INTO appointments/.test(c[0] as string))!;
    expect(insert[1][3]).toBe(30);
  });

  it('books video only when the doctor offers it', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ ...DOCTOR_ROW[0], video_enabled: false }])
      .mockResolvedValueOnce(LOCK).mockResolvedValueOnce(INSERTED_ROW).mockResolvedValueOnce([]);
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE, consultation_type: 'video' }), res);
    const insert = query.mock.calls.find(c => /INSERT INTO appointments/.test(c[0] as string))!;
    expect(insert[1][4]).toBe('in_person');
  });

  it('runs the insert behind a per-doctor advisory lock (race-proof)', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock/);
    expect(query.mock.calls[1][1]).toEqual(['appointments:doc_1']);
  });

  it('a unique-index clash (23505, migration 017) is a clean 409', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(DOCTOR_ROW).mockResolvedValueOnce(LOCK)
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(409);
  });
});

describe('appointments/book notifies the doctor', () => {
  const VAPID = { VAPID_PUBLIC_KEY: 'BPub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:hello@womanie.info' };
  beforeEach(() => {
    for (const [k, v] of Object.entries(VAPID)) vi.stubEnv(k, v);
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    sendPush.mockReset(); sendPush.mockResolvedValue('sent');
    query.mockReset();
    query.mockImplementation(async (text: string) => {
      if (/FROM doctor_profiles/.test(text)) return DOCTOR_ROW;
      if (/pg_advisory_xact_lock/.test(text)) return LOCK;
      if (/INSERT INTO appointments/.test(text)) return INSERTED_ROW;
      if (/FROM push_subscriptions/.test(text)) return [
        { id: 's1', user_id: 'doc_1', endpoint: 'https://p/doc', p256dh: 'k', auth: 'a', prefs: { bookings: true } },
        { id: 's2', user_id: 'doc_1', endpoint: 'https://p/doc2', p256dh: 'k', auth: 'a', prefs: { bookings: false } },
        // A row for someone else must never be sent to, even if a query returned it.
        { id: 's3', user_id: 'user_p1', endpoint: 'https://p/pat', p256dh: 'k', auth: 'a', prefs: {} },
      ];
      return [];
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('sends one discreet alert to the doctor\'s opted-in devices only', async () => {
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(200);
    const subQuery = query.mock.calls.find(c => /FROM push_subscriptions/.test(c[0] as string))!;
    expect(subQuery[1]).toEqual(['doc_1']);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush.mock.calls[0][1].endpoint).toBe('https://p/doc');
    const payload = sendPush.mock.calls[0][2];
    expect(payload.body).toBe('New booking: Tue 6 Jan, 10:00');
    expect(payload.url).toBe('/doctor/dashboard');
  });

  it('a push failure never fails the booking', async () => {
    sendPush.mockRejectedValue(new Error('boom'));
    const res = mockRes();
    await handler(mockReq({ doctor_id: 'doc_1', scheduled_at: FUTURE }), res);
    expect(res._status).toBe(200);
  });
});
