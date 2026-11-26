import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// A tiny in-memory stand-in for the three tables the consent gate reads,
// so each access rule is exercised by DATA (role row, connection status,
// which patient), not by stubbing the gate's answer.
const db = {
  roles: [] as Array<{ user_id: string; role: string }>,
  connections: [] as Array<{ doctor_id: string; patient_id: string; status: string }>,
  inserted: [] as unknown[][],
  pushSubs: [] as Array<Record<string, unknown>>,
  insertError: null as Error | null,
};
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/FROM doctor_patient_connections/.test(sql)) {
    const [doctorId, patientId] = params as string[];
    const hasRole = db.roles.some(r => r.user_id === doctorId && r.role === 'doctor');
    const conn = db.connections.find(c => c.doctor_id === doctorId && c.patient_id === patientId && c.status === 'approved');
    return hasRole && conn ? [{ id: 'conn_1' }] : [];
  }
  if (/INSERT INTO health_documents/.test(sql)) {
    if (db.insertError) throw db.insertError;
    db.inserted.push(params);
    return [{ id: 'doc_new', file_name: params[1], mime_type: params[5], uploaded_at: '2026-11-26T10:00:00Z', document_type: params[3] }];
  }
  if (/FROM doctor_profiles WHERE user_id/.test(sql)) return [{ full_name: 'Anna Keller' }];
  if (/FROM push_subscriptions/.test(sql)) return db.pushSubs.filter(s => s.user_id === params[0]);
  if (/FROM health_documents h/.test(sql)) {
    return [{ id: 'doc_9', notes: 'See you in 6 months', uploaded_at: '2026-11-25T10:00:00Z', full_name: 'Anna Keller' }];
  }
  return [];
});
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
const head = vi.fn();
vi.mock('@vercel/blob', () => ({ head: (...a: unknown[]) => head(...a) }));
const sendPush = vi.fn();
vi.mock('../../_lib/push-send.js', () => ({
  vapidConfig: () => ({ publicKey: 'p', privateKey: 'k', subject: 'mailto:x@y.z' }),
  sendPush: (...a: unknown[]) => sendPush(...a),
}));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './from-doctor';
import { getAuthUser } from '../../_lib/auth.js';
import { ROUTES } from '../../router';

const DOCTOR = { id: 'doc_a', email: 'a@test.com', sessionId: 's1' };
const OTHER_DOCTOR = { id: 'doc_b', email: 'b@test.com', sessionId: 's2' };
const PATIENT = 'pat_1';
const OTHER_PATIENT = 'pat_2';
const URL_OK = `https://store.public.blob.vercel-storage.com/${PATIENT}/1700000000000-lab-x7Ab.pdf`;

function mockRes() {
  const r = { _status: 200, _body: null as unknown } as unknown as VercelResponse & { _status: number; _body: unknown };
  Object.assign(r, { setHeader: vi.fn(), end: vi.fn() });
  r.status = ((c: number) => { r._status = c; return r; }) as VercelResponse['status'];
  r.json = ((d: unknown) => { r._body = d; return r; }) as VercelResponse['json'];
  return r;
}

function post(body: Record<string, unknown>): VercelRequest {
  return { method: 'POST', headers: {}, query: {}, body } as unknown as VercelRequest;
}

const BODY = { patientId: PATIENT, url: URL_OK, fileName: 'lab.pdf', mimeType: 'application/pdf', documentType: 'Lab Result', note: 'All normal' };

beforeEach(() => {
  db.roles = [{ user_id: DOCTOR.id, role: 'doctor' }, { user_id: OTHER_DOCTOR.id, role: 'doctor' }];
  db.connections = [
    { doctor_id: DOCTOR.id, patient_id: PATIENT, status: 'approved' },
    { doctor_id: OTHER_DOCTOR.id, patient_id: OTHER_PATIENT, status: 'approved' },
  ];
  db.inserted = [];
  db.pushSubs = [];
  db.insertError = null;
  query.mockClear();
  head.mockReset();
  head.mockResolvedValue({ contentType: 'application/pdf', size: 12345 });
  sendPush.mockReset();
  sendPush.mockResolvedValue('sent');
  vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
});

describe('POST /api/docs/from-doctor: who may send', () => {
  it('is routed through api/router (no new top-level function)', () => {
    expect(ROUTES['docs/from-doctor']).toBe(handler);
  });

  it('401 without a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(401);
    expect(db.inserted).toHaveLength(0);
  });

  it('an approved, still-verified doctor can send: stored as HER document, marked from this doctor', async () => {
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(200);
    expect(db.inserted).toHaveLength(1);
    const [userId, fileName, filePath, docType, size, mime, note, sender] = db.inserted[0];
    expect(userId).toBe(PATIENT);
    expect(sender).toBe(DOCTOR.id);
    expect(filePath).toBe(URL_OK);
    expect([fileName, docType, size, mime, note]).toEqual(['lab.pdf', 'Lab Result', 12345, 'application/pdf', 'All normal']);
    const doc = (res._body as { document: Record<string, unknown> }).document;
    expect(doc.sent_by_me).toBe(true);
    // The Blob URL never goes back to the browser.
    expect(JSON.stringify(res._body)).not.toContain('blob.vercel-storage.com');
    expect(JSON.stringify(res._body)).not.toContain('file_path');
  });

  it('a revoked doctor (role removed, connection row left behind) is refused', async () => {
    db.roles = db.roles.filter(r => r.user_id !== DOCTOR.id);
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(403);
    expect(db.inserted).toHaveLength(0);
    expect(head).not.toHaveBeenCalled();
  });

  it('a pending connection is not consent yet', async () => {
    db.connections = [{ doctor_id: DOCTOR.id, patient_id: PATIENT, status: 'pending' }];
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(403);
    expect(db.inserted).toHaveLength(0);
  });

  it("another doctor's patient is refused", async () => {
    const res = mockRes();
    await handler(post({ ...BODY, patientId: OTHER_PATIENT, url: URL_OK.replace(PATIENT, OTHER_PATIENT) }), res);
    expect(res._status).toBe(403);
    expect(db.inserted).toHaveLength(0);
  });

  it('a patient account (no doctor role) cannot send to someone else', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: OTHER_PATIENT, email: 'p@test.com', sessionId: 's3' });
    db.connections.push({ doctor_id: OTHER_PATIENT, patient_id: PATIENT, status: 'approved' });
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(403);
  });
});

describe('POST /api/docs/from-doctor: the file', () => {
  it("refuses a URL outside the patient's own upload folder (e.g. the doctor's own, or another patient's)", async () => {
    for (const url of [
      URL_OK.replace(PATIENT, DOCTOR.id),
      URL_OK.replace(PATIENT, OTHER_PATIENT),
      'https://evil.example.com/pat_1/x.pdf',
      `https://store.public.blob.vercel-storage.com/${PATIENT}/../${OTHER_PATIENT}/x.pdf`,
    ]) {
      const res = mockRes();
      await handler(post({ ...BODY, url }), res);
      expect(res._status).toBe(400);
    }
    expect(db.inserted).toHaveLength(0);
  });

  it('same type limits as the patient upload, checked on the stored blob', async () => {
    head.mockResolvedValue({ contentType: 'text/html', size: 100 });
    let res = mockRes();
    await handler(post({ ...BODY, fileName: 'x.html', mimeType: 'text/html' }), res);
    expect(res._status).toBe(400);
    head.mockResolvedValue({ contentType: 'image/svg+xml', size: 100 });
    res = mockRes();
    await handler(post({ ...BODY, fileName: 'x.svg', mimeType: 'image/svg+xml' }), res);
    expect(res._status).toBe(400);
    expect(db.inserted).toHaveLength(0);
  });

  it('same size limit as the patient upload (200 MB)', async () => {
    head.mockResolvedValue({ contentType: 'application/pdf', size: 200 * 1024 * 1024 + 1 });
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(413);
    expect(db.inserted).toHaveLength(0);
  });

  it('a file that is not in the store is refused', async () => {
    head.mockRejectedValue(new Error('BlobNotFoundError'));
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(400);
  });

  it('strips any path from the file name and caps the note', async () => {
    const res = mockRes();
    await handler(post({ ...BODY, fileName: '../../etc/lab.pdf', note: 'x'.repeat(2000) }), res);
    expect(res._status).toBe(200);
    expect(db.inserted[0][1]).toBe('lab.pdf');
    expect(String(db.inserted[0][6]).length).toBe(500);
  });

  it('answers "not available yet" before migration 021 is applied', async () => {
    db.insertError = new Error('column "uploaded_by_doctor_id" of relation "health_documents" does not exist');
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(503);
  });
});

describe('POST /api/docs/from-doctor: telling the patient', () => {
  it("pushes to the patient's own devices only, without the document name", async () => {
    db.pushSubs = [
      { id: 's1', user_id: PATIENT, endpoint: 'https://p/1', p256dh: 'k', auth: 'a', prefs: {} },
      { id: 's2', user_id: PATIENT, endpoint: 'https://p/2', p256dh: 'k', auth: 'a', prefs: { documents: false } },
      { id: 's3', user_id: DOCTOR.id, endpoint: 'https://p/3', p256dh: 'k', auth: 'a', prefs: {} },
    ];
    const res = mockRes();
    await handler(post({ ...BODY, fileName: 'HIV-test-result.pdf' }), res);
    expect(res._status).toBe(200);
    expect(sendPush).toHaveBeenCalledTimes(1);
    const [, sub, payload] = sendPush.mock.calls[0] as [unknown, { endpoint: string }, { title: string; body: string }];
    expect(sub.endpoint).toBe('https://p/1');
    expect(payload.body).toBe('Dr Anna Keller added a document');
    expect(JSON.stringify(payload)).not.toMatch(/HIV|lab|Lab Result|pdf/i);
  });

  it('a push failure never fails the send', async () => {
    db.pushSubs = [{ id: 's1', user_id: PATIENT, endpoint: 'https://p/1', p256dh: 'k', auth: 'a', prefs: {} }];
    sendPush.mockRejectedValue(new Error('network'));
    const res = mockRes();
    await handler(post(BODY), res);
    expect(res._status).toBe(200);
  });
});

describe('GET /api/docs/from-doctor (patient)', () => {
  it("lists only the session user's doctor-sent documents, with the sender's name and no file path", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: PATIENT, email: 'p@test.com', sessionId: 's9' });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { userId: OTHER_PATIENT } } as unknown as VercelRequest, res);
    expect(res._status).toBe(200);
    const call = query.mock.calls.find(([sql]) => /FROM health_documents h/.test(sql))!;
    expect(call[1]).toEqual([PATIENT]);
    expect(call[0]).not.toMatch(/file_path/);
    expect(res._body).toEqual({
      documents: [{ id: 'doc_9', doctor_name: 'Dr Anna Keller', note: 'See you in 6 months', uploaded_at: '2026-11-25T10:00:00Z' }],
    });
  });
});
