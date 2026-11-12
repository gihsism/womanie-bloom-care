import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './patient';
import { getAuthUser } from '../../_lib/auth.js';

const DOCTOR = { id: 'doc_1', email: 'dr@test.com', sessionId: 'sess_dr1' };
const PATIENT_ID = 'patient_1';
const CONN_ROW = [{ id: 'conn_1' }];

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

function mockReq(patientId?: string): VercelRequest {
  return {
    method: 'GET',
    headers: { cookie: 'womanie_session=fake' },
    query: patientId ? { id: patientId } : {},
  } as unknown as VercelRequest;
}

describe('doctors/patient security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockReset();
    // Success path: consent gate, audit log, then 7 chart-data queries (Promise.all).
    query.mockResolvedValueOnce(CONN_ROW); // consent gate
    query.mockResolvedValueOnce([]);        // chart_access_log INSERT (best-effort)
    query.mockResolvedValue([]);            // all 7 Promise.all data queries
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(401);
  });

  it('returns 400 when patient id is missing from the query string', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(400);
  });

  // Core consent gate: a doctor with no approved connection (pending, revoked,
  // or simply absent) must receive 403 — not any patient data.
  it('returns 403 when no approved connection exists for this doctor–patient pair', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(403);
    expect((res._body as Record<string, string>).error).toMatch(/approved/i);
  });

  // Regression guard: confirms the consent gate uses status = 'approved'.
  // Weakening this to merely checking connection existence (without the status
  // filter) would let a doctor with a pending or revoked connection read the
  // patient's full chart before or after the patient has consented.
  it("consent gate SQL checks status = 'approved'", async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    const [consentSql] = query.mock.calls[0] as [string, unknown[]];
    expect(consentSql).toMatch(/doctor_patient_connections/i);
    expect(consentSql).toMatch(/status\s*=\s*'approved'/i);
  });

  // Ownership invariant: the doctor_id parameter in the consent check must be
  // the authenticated session's id, never a client-supplied value. If a refactor
  // allowed the caller to specify doctor_id via query params, any authenticated
  // user could impersonate a doctor to read a connected patient's chart.
  it('consent gate binds session doctor id as doctor_id, never a client-supplied value', async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(DOCTOR.id);  // $1 = doctor_id from session
    expect(params[1]).toBe(PATIENT_ID); // $2 = patient_id from query string
  });

  // Audit trail guard: every chart access must be written to chart_access_log
  // so the patient can review who viewed their data from Settings. Dropping
  // this INSERT silently removes the GDPR transparency feature.
  it('writes an audit log entry to chart_access_log on each successful chart fetch', async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    const auditCalls = query.mock.calls.filter(([sql]: [string]) =>
      /chart_access_log/i.test(sql)
    );
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 200 with the full patient data shape on success', async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(body).toHaveProperty('profile');
    expect(body).toHaveProperty('healthSignals');
    expect(body).toHaveProperty('documents');
    expect(body).toHaveProperty('medicalData');
    expect(body).toHaveProperty('notes');
    expect(body).toHaveProperty('appointments');
    expect(body).toHaveProperty('periodRecords');
  });
});
