import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './pending';
import { getAuthUser } from '../../_lib/auth.js';

const PATIENT = { id: 'patient_1', email: 'patient@test.com', sessionId: 'sess_1' };

const PENDING_ROW = {
  id: 'conn_2', doctor_id: 'doctor_2', connection_type: 'primary',
  created_at: '2026-01-20T00:00:00Z',
  full_name: 'Dr. Jones', title: 'MD',
  specialties: ['Cardiology'], years_experience: 8,
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

describe('connections/pending security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(PATIENT);
    query.mockReset();
    query.mockResolvedValue([PENDING_ROW]);
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
  // user see which doctors are requesting access to another patient's records
  // — revealing a sensitive pending medical relationship without that
  // patient's knowledge.
  it('binds session patient id as $1 (patient_id), never a client-supplied value', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(PATIENT.id);
  });

  // Regression guard: WHERE clause must reference patient_id = $1 so the
  // query returns only the calling patient's pending connections, not all rows.
  it('SQL filters doctor_patient_connections by patient_id = $1', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+c\.patient_id\s*=\s*\$1/i);
  });

  // Status filter guard: must only return pending connections, not approved
  // or rejected ones. Dropping this filter would surface doctors the patient
  // already approved or rejected into the pending-approval UI.
  it("SQL filters by c.status = 'pending'", async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/c\.status\s*=\s*'pending'/i);
  });

  it('returns 200 with a pending array', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { pending: unknown[] };
    expect(Array.isArray(body.pending)).toBe(true);
    expect(body.pending).toHaveLength(1);
  });

  it('returns 200 with an empty pending array when no connections exist', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { pending: unknown[] };
    expect(body.pending).toHaveLength(0);
  });

  it('returns 500 on a database error', async () => {
    query.mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
  });
});
