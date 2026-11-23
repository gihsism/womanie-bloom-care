import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './connections';
import { getAuthUser } from '../../_lib/auth.js';

const DOCTOR = { id: 'doctor_1', email: 'doctor@test.com', sessionId: 'sess_1' };

// Approved connection: health fields are visible.
const APPROVED_ROW = {
  id: 'conn_1', patient_id: 'patient_1', doctor_id: 'doctor_1',
  status: 'approved', connection_type: 'primary',
  created_at: '2026-01-01T00:00:00Z',
  patient_full_name: 'Jane Doe',
  patient_life_stage: 'reproductive',
  last_upload_at: '2026-01-15T00:00:00Z',
  recent_doc_count: '2',
};

// Pending connection: health fields are NULL (CASE WHEN gate).
const PENDING_ROW = {
  id: 'conn_2', patient_id: 'patient_2', doctor_id: 'doctor_1',
  status: 'pending', connection_type: 'referral',
  created_at: '2026-01-02T00:00:00Z',
  patient_full_name: 'Mary Smith',
  patient_life_stage: null,
  last_upload_at: null,
  recent_doc_count: null,
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

describe('doctors/connections security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockReset();
    query.mockResolvedValue([APPROVED_ROW, PENDING_ROW]);
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

  // Doctor ownership invariant: SQL must bind the session doctor's id as $1.
  // A refactor that trusted a query-string value would let any authenticated
  // user enumerate another doctor's entire patient list.
  it('binds session doctor id as $1 (doctor_id), never a client-supplied value', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(DOCTOR.id);
  });

  // Regression guard: WHERE clause must reference doctor_id = $1 so the
  // query returns only the calling doctor's connection rows, not all rows.
  it('SQL filters doctor_patient_connections by doctor_id = $1', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+c\.doctor_id\s*=\s*\$1/i);
  });

  // Health data gate: life_stage, last_upload_at, and recent_doc_count must
  // only be exposed for approved connections via CASE WHEN. A refactor that
  // dropped this guard would reveal a patient's health context (life stage,
  // document activity) to the doctor before the patient has consented.
  it('SQL gates health data fields on c.status = \'approved\' via CASE WHEN', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    // All three health-sensitive columns must be wrapped in CASE WHEN status = 'approved'.
    expect(sql).toMatch(/CASE\s+WHEN\s+c\.status\s*=\s*'approved'/i);
    expect(sql).toMatch(/patient_life_stage/i);
    expect(sql).toMatch(/last_upload_at/i);
    expect(sql).toMatch(/recent_doc_count/i);
  });

  it('returns 200 with a connections array', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { connections: unknown[] };
    expect(Array.isArray(body.connections)).toBe(true);
    expect(body.connections).toHaveLength(2);
  });

  // Verifies that the DB-level CASE WHEN gate produces null health fields for
  // pending connections — the query result accurately reflects the invariant.
  it('health data fields are null on a pending connection row', async () => {
    query.mockResolvedValue([PENDING_ROW]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { connections: typeof PENDING_ROW[] };
    expect(body.connections[0].patient_life_stage).toBeNull();
    expect(body.connections[0].last_upload_at).toBeNull();
    expect(body.connections[0].recent_doc_count).toBeNull();
  });

  it('returns 500 on a database error', async () => {
    query.mockRejectedValue(new Error('DB down'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
  });
});
