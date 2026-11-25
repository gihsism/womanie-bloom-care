import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './approved';
import { getAuthUser } from '../../_lib/auth.js';

const PATIENT = { id: 'patient_1', email: 'patient@test.com', sessionId: 'sess_1' };

const APPROVED_ROW = {
  id: 'conn_1', doctor_id: 'doctor_1',
  approved_at: '2026-01-15T00:00:00Z',
  full_name: 'Dr. Smith', title: 'MD',
  specialties: ['OB/GYN'], years_experience: 10,
  avatar_url: null, is_verified: true,
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

describe('connections/approved security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(PATIENT);
    query.mockReset();
    query.mockResolvedValue([APPROVED_ROW]);
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

  // Ownership invariant: SQL must bind the session patient's id as $1.
  // A refactor that trusted a query-string value would let any authenticated
  // user enumerate another patient's entire approved-doctor list — exposing
  // which doctors are treating them (a sensitive medical relationship).
  it('binds session patient id as $1 (patient_id), never a client-supplied value', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(PATIENT.id);
  });

  // Regression guard: WHERE clause must reference patient_id = $1 so the
  // query returns only the calling patient's connections, not all rows.
  it('SQL filters doctor_patient_connections by patient_id = $1', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+c\.patient_id\s*=\s*\$1/i);
  });

  // Status filter guard: must only return approved connections, not pending
  // or rejected ones. Dropping this filter would expose unapproved doctors
  // in the patient's revoke list UI.
  it("SQL filters by c.status = 'approved'", async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/c\.status\s*=\s*'approved'/i);
  });

  it('returns 200 with an approved array', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { approved: unknown[] };
    expect(Array.isArray(body.approved)).toBe(true);
    expect(body.approved).toHaveLength(1);
  });

  it('returns 200 with an empty approved array when no connections exist', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { approved: unknown[] };
    expect(body.approved).toHaveLength(0);
  });

  it('returns 500 on a database error', async () => {
    query.mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
  });
});
