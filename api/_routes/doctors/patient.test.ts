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
    const auditCalls = query.mock.calls.filter(([sql]) =>
      /chart_access_log/i.test(sql)
    );
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
  });

  // The Blob URL never leaves the server: the doctor's "Open document"
  // button goes through /api/docs/file?id=. The documents query may only
  // derive has_file from file_path, and must be scoped to the patient id
  // that passed the consent gate.
  it('documents query exposes has_file but never the raw file_path, scoped to the consented patient', async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    const docCall = query.mock.calls.find(([sql]) => /FROM health_documents/i.test(sql)) as [string, unknown[]];
    expect(docCall[0]).toMatch(/AS has_file/);
    // Every mention of file_path is inside the has_file expression.
    const stripped = docCall[0].replace(/\(file_path IS NOT NULL AND file_path <> ''\) AS has_file/, '');
    expect(stripped).not.toMatch(/file_path/);
    expect(docCall[1]).toEqual([PATIENT_ID]);
  });

  it('returns no chart data at all when consent is missing', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(403);
    expect(query.mock.calls.some(([sql]) => /health_documents|daily_health_signals|doctor_notes/i.test(sql))).toBe(false);
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
    expect(body).toHaveProperty('visitQuestions');
  });

  // Questions to bring: only after the consent gate, only for this doctor's
  // own visits with this patient, read-only.
  it('visit questions are read after the consent gate, scoped to this doctor and patient', async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    const idx = query.mock.calls.findIndex(([sql]) => /FROM visit_questions/i.test(sql));
    expect(idx).toBeGreaterThan(0);
    const [vqSql, params] = query.mock.calls[idx] as [string, unknown[]];
    expect(vqSql).toMatch(/^\s*SELECT/i);
    expect(vqSql).toMatch(/a\.patient_id\s*=\s*vq\.user_id/i);
    expect(vqSql).toMatch(/a\.doctor_id\s*=\s*\$2/i);
    expect(params).toEqual([PATIENT_ID, DOCTOR.id]);
  });

  it('a missing visit_questions table (migration not applied) does not break the chart', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(CONN_ROW);
    query.mockResolvedValueOnce([]);
    query.mockImplementation(async (sql: string) => {
      if (/visit_questions/i.test(sql)) throw new Error('relation "visit_questions" does not exist');
      return [];
    });
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).visitQuestions).toEqual([]);
  });

  // Current medicines: read only after the consent gate, only for the
  // consented patient, only active rows, never a write.
  it('medicines are read after the consent gate, scoped to the consented patient, active only', async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    const idx = query.mock.calls.findIndex(([sql]) => /FROM medications/i.test(sql));
    expect(idx).toBeGreaterThan(0);
    const [medSql, params] = query.mock.calls[idx] as [string, unknown[]];
    expect(medSql).toMatch(/^\s*SELECT/i);
    expect(medSql).toMatch(/WHERE user_id = \$1 AND active IS NOT FALSE/);
    expect(params).toEqual([PATIENT_ID]);
    expect((res._body as Record<string, unknown>).medicines).toEqual([]);
  });

  it('no medicines are read without consent', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(403);
    expect(query.mock.calls.some(([sql]) => /medications/i.test(sql))).toBe(false);
  });

  it('a medicines read failure does not break the chart', async () => {
    query.mockReset();
    query.mockResolvedValueOnce(CONN_ROW);
    query.mockResolvedValueOnce([]);
    query.mockImplementation(async (sql: string) => {
      if (/FROM medications/i.test(sql)) throw new Error('relation "medications" does not exist');
      return [];
    });
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).medicines).toEqual([]);
  });

  it('no visit questions are read without consent', async () => {
    query.mockReset();
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(query.mock.calls.some(([sql]) => /visit_questions/i.test(sql))).toBe(false);
  });
});
