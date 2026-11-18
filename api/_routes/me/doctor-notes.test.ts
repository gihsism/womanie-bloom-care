import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './doctor-notes';
import { getAuthUser } from '../../_lib/auth.js';

const USER = { id: 'patient_1', email: 'patient@test.com', sessionId: 'sess_1' };

const NOTE_ROW = {
  id: 'note_1', doctor_id: 'doc_1', title: 'Follow-up', content: 'Normal results.',
  note_type: 'clinical', created_at: '2026-01-01T00:00:00Z',
  doctor_name: 'Dr. Alice', doctor_title: 'MD',
  doctor_specialties: ['Cardiology'], doctor_avatar_url: null, doctor_verified: true,
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

describe('me/doctor-notes security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    query.mockResolvedValue([NOTE_ROW]);
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

  // Ownership invariant: the SQL must bind the session user's id as the
  // patient_id parameter. A refactor that substituted a query-string value
  // would let any authenticated user read another patient's notes.
  it('binds session user id as $1 (patient_id), never a client-supplied value', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(USER.id);
  });

  // Visibility invariant: the query MUST include is_visible_to_patient = TRUE.
  // Dropping this filter would expose notes the doctor marked as internal-only
  // to the patient — a direct privacy breach of a deliberate doctor decision.
  it('SQL includes is_visible_to_patient = TRUE filter', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/is_visible_to_patient\s*=\s*TRUE/i);
  });

  // Regression guard: patient_id column in WHERE must be bound to $1
  // so the query is correctly scoped to the session patient.
  it('SQL filters doctor_notes by patient_id = $1', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/patient_id\s*=\s*\$1/i);
  });

  it('returns 200 with a notes array containing the visible note', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { notes: unknown[] };
    expect(Array.isArray(body.notes)).toBe(true);
    expect(body.notes[0]).toMatchObject({ id: 'note_1', title: 'Follow-up' });
  });

  it('returns an empty notes array when no visible notes exist', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { notes: unknown[] };
    expect(body.notes).toEqual([]);
  });
});
