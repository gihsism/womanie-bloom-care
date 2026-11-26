import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => Object.assign(() => Promise.resolve([]), { query, transaction: vi.fn() }) }));
vi.mock('./_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('./_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('./_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn(async () => ({ ok: true, remaining: 1, limit: 25, retryInSec: 0 })) }));
const get = vi.fn();
vi.mock('@vercel/blob', () => ({ get: (...a: unknown[]) => get(...a) }));
const callAnthropicWithRetry = vi.fn();
vi.mock('./_lib/anthropic.js', () => ({
  callAnthropicWithRetry: (...a: unknown[]) => callAnthropicWithRetry(...a),
  SONNET_MODEL: 'm',
  SONNET_NO_THINKING: {},
  replyText: () => undefined,
}));

import handler from './analyze-document';
import { getAuthUser } from './_lib/auth.js';

const USER = { id: 'user_attacker', email: 'a@test.com', sessionId: 's1' };

function mockRes() {
  const r = { _status: 200, _body: null as unknown } as unknown as VercelResponse & { _status: number; _body: unknown };
  Object.assign(r, { setHeader: vi.fn(), end: vi.fn() });
  r.status = ((c: number) => { r._status = c; return r; }) as VercelResponse['status'];
  r.json = ((d: unknown) => { r._body = d; return r; }) as VercelResponse['json'];
  return r;
}

function mockReq(): VercelRequest {
  return {
    method: 'POST',
    headers: { cookie: 'womanie_session=fake' },
    body: { documentId: 'doc_1', userId: USER.id },
  } as unknown as VercelRequest;
}

describe('POST /api/analyze-document: which file it reads', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    query.mockReset();
    get.mockReset();
    callAnthropicWithRetry.mockReset();
    callAnthropicWithRetry.mockRejectedValue(new Error('stop here'));
    vi.mocked(getAuthUser).mockResolvedValue(USER);
  });

  // health_documents.file_path is client-writable at insert through /api/db.
  // A row pointed at ANOTHER user's Blob file must not make the server
  // download that file and analyse it into the caller's account.
  it("never downloads a Blob file outside the caller's own upload folder", async () => {
    query.mockImplementation(async (sql: string) => {
      if (/FROM health_documents/.test(sql)) {
        return [{
          file_path: 'https://abc.public.blob.vercel-storage.com/user_victim/1700000000000-lab.pdf',
          file_name: 'lab.pdf',
          mime_type: 'application/pdf',
        }];
      }
      return [];
    });
    const res = mockRes();
    await handler(mockReq(), res);
    expect(get).not.toHaveBeenCalled();
  });

  it('500 replies carry a generic message, not the internal error text', async () => {
    query.mockImplementation(async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'); });
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
    expect(JSON.stringify(res._body)).not.toMatch(/ECONNREFUSED|hunter2/);
  });
});

// A doctor may start the analysis of a document she sent into a patient's
// Records herself, and nothing else of the patient's.
describe('POST /api/analyze-document: doctor-sent documents', () => {
  const DOCTOR = { id: 'doc_a', email: 'd@test.com', sessionId: 's2' };
  const PATIENT = 'pat_1';
  let roleOk = true;
  let connStatus = 'approved';

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    roleOk = true;
    connStatus = 'approved';
    query.mockReset();
    get.mockReset();
    get.mockResolvedValue(null);
    callAnthropicWithRetry.mockReset();
    callAnthropicWithRetry.mockRejectedValue(new Error('stop here'));
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockImplementation(async (sql: string, params: string[]) => {
      if (/FROM doctor_patient_connections/.test(sql)) {
        return roleOk && connStatus === 'approved' && params[0] === DOCTOR.id && params[1] === PATIENT ? [{ id: 'c' }] : [];
      }
      if (/FROM health_documents/.test(sql)) {
        // Only the row this doctor sent matches the uploaded_by_doctor_id filter.
        if (/uploaded_by_doctor_id = \$3/.test(sql) && params[0] === 'doc_sent' && params[1] === PATIENT && params[2] === DOCTOR.id) {
          return [{ file_path: `https://s.public.blob.vercel-storage.com/${PATIENT}/1-lab.pdf`, file_name: 'lab.pdf', mime_type: 'application/pdf' }];
        }
        return [];
      }
      return [];
    });
  });

  const req = (documentId: string, userId = PATIENT) =>
    ({ method: 'POST', headers: {}, body: { documentId, userId } }) as unknown as VercelRequest;

  it("reads the doctor's own sent document from the PATIENT's folder", async () => {
    const res = mockRes();
    await handler(req('doc_sent'), res);
    expect(get).toHaveBeenCalledTimes(1);
    expect(String(get.mock.calls[0][0])).toContain(`/${PATIENT}/`);
  });

  it("404s on the patient's own uploads (not sent by this doctor)", async () => {
    const res = mockRes();
    await handler(req('doc_hers'), res);
    expect(res._status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });

  it('403s for a revoked doctor, a pending connection, or another patient', async () => {
    roleOk = false;
    let res = mockRes();
    await handler(req('doc_sent'), res);
    expect(res._status).toBe(403);
    roleOk = true;
    connStatus = 'pending';
    res = mockRes();
    await handler(req('doc_sent'), res);
    expect(res._status).toBe(403);
    connStatus = 'approved';
    res = mockRes();
    await handler(req('doc_sent', 'pat_2'), res);
    expect(res._status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });
});
