import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './chart-access';
import { getAuthUser } from '../../_lib/auth.js';

const USER = { id: 'patient_chart_1', email: 'patient@test.com', sessionId: 'sess_chart_1' };

const ACCESS_ROW = {
  id: 'access_1',
  viewed_at: '2026-01-01T00:00:00Z',
  surface: 'summary',
  doctor_name: 'Dr. Alice',
  doctor_specialty: 'Cardiology',
  doctor_avatar_url: null,
};

function mockRes() {
  let status = 200;
  const body: { _status: number; _body: unknown } & Partial<VercelResponse> = {
    _status: 200, _body: null,
    setHeader: vi.fn() as VercelResponse['setHeader'],
    end: vi.fn() as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

function mockReq(method = 'GET'): VercelRequest {
  return { method, headers: { cookie: 'womanie_session=fake' }, query: {} } as unknown as VercelRequest;
}

describe('me/chart-access security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    query.mockResolvedValue([ACCESS_ROW]);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for non-GET methods', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = mockRes();
      await handler(mockReq(method), res);
      expect(res._status).toBe(405);
    }
  });

  // Ownership invariant: the SQL must bind the session user's id as $1 (patient_id).
  // A refactor that substituted a query-string value would let any authenticated
  // user enumerate another patient's chart-access history — revealing which doctors
  // have opened their private medical records and when.
  it('binds session user id as $1 (patient_id), never a client-supplied value', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(USER.id);
  });

  // Regression guard: confirms the WHERE clause references patient_id = $1 so the
  // query is correctly scoped to the session patient.
  it('SQL filters chart_access_log by patient_id = $1', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/patient_id\s*=\s*\$1/i);
  });

  it('returns 200 with an accesses array on success', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { accesses: unknown[] };
    expect(Array.isArray(body.accesses)).toBe(true);
    expect(body.accesses[0]).toMatchObject({ id: 'access_1', surface: 'summary' });
  });

  it('returns an empty accesses array when no log entries exist', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { accesses: unknown[] };
    expect(body.accesses).toEqual([]);
  });

  it('returns 500 on a database error', async () => {
    query.mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
  });
});
