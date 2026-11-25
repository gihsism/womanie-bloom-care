import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
const get = vi.fn();
vi.mock('@vercel/blob', () => ({ get: (...a: unknown[]) => get(...a) }));

import handler, { contentDisposition, resolveContentType } from './file';
import { getAuthUser } from '../../_lib/auth.js';

const PATIENT = { id: 'user_1', email: 'p@test.com', sessionId: 's1' };
const OTHER = { id: 'user_2', email: 'o@test.com', sessionId: 's2' };
const DOCTOR = { id: 'doc_1', email: 'dr@test.com', sessionId: 's3' };
const BASE = 'https://abc123.public.blob.vercel-storage.com';
const DOC = {
  user_id: 'user_1',
  file_path: `${BASE}/user_1/1700000000000-lab.pdf-Xy7Rand0m.pdf`,
  file_name: 'Blood test "März".pdf',
  mime_type: 'application/pdf',
};

type Res = VercelResponse & { _status: number; _body: unknown; _headers: Record<string, string>; _data: Buffer };

function mockRes(): Res {
  const chunks: Buffer[] = [];
  const w = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  }) as unknown as Res;
  w._status = 200;
  w._body = null;
  w._headers = {};
  Object.defineProperty(w, '_data', { get: () => Buffer.concat(chunks) });
  w.setHeader = ((k: string, v: string) => { w._headers[k.toLowerCase()] = String(v); return w; }) as Res['setHeader'];
  w.status = ((c: number) => { w._status = c; return w; }) as Res['status'];
  w.json = ((d: unknown) => { w._body = d; return w; }) as Res['json'];
  return w;
}

function mockReq(id?: string, method = 'GET'): VercelRequest {
  return { method, headers: { cookie: 'womanie_session=fake' }, query: id ? { id } : {} } as unknown as VercelRequest;
}

function blobOk(body = '%PDF-1.4 test', contentType = 'application/pdf') {
  const bytes = new TextEncoder().encode(body);
  return {
    statusCode: 200,
    stream: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }),
    headers: new Headers(),
    blob: { contentType, size: bytes.length },
  };
}

const sqlCalls = () => query.mock.calls.map(([s]) => String(s));

describe('GET /api/docs/file — authorised document proxy', () => {
  beforeEach(() => {
    query.mockReset();
    get.mockReset();
    vi.mocked(getAuthUser).mockResolvedValue(PATIENT);
    get.mockResolvedValue(blobOk());
  });

  it('401 without a session, and never touches the database or Blob', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('400 without an id; 405 for non-GET', async () => {
    let res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(400);
    res = mockRes();
    await handler(mockReq('doc_a', 'POST'), res);
    expect(res._status).toBe(405);
  });

  it('owner: streams the file with safe headers, looked up by id (never a client URL)', async () => {
    query.mockResolvedValueOnce([DOC]);
    const res = mockRes();
    await handler({ ...mockReq('doc_a'), query: { id: 'doc_a', url: 'https://evil.example/x' } } as unknown as VercelRequest, res);
    expect(res._status).toBe(200);
    expect(res._data.toString()).toBe('%PDF-1.4 test');
    expect(res._headers['content-type']).toBe('application/pdf');
    expect(res._headers['cache-control']).toBe('private, no-store');
    expect(res._headers['x-content-type-options']).toBe('nosniff');
    expect(res._headers['content-disposition']).toMatch(/^inline; filename="Blood test M_rz.pdf"; filename\*=UTF-8''Blood%20test%20M%C3%A4rz.pdf$/);
    // DB lookup by id; Blob read of the stored URL with the server token.
    expect(query.mock.calls[0][1]).toEqual(['doc_a']);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe(DOC.file_path);
    expect(get.mock.calls[0][1]).toMatchObject({ access: 'public' });
    // Owner reads are not doctor reads: no connection check, no audit row.
    expect(sqlCalls().some(s => /doctor_patient_connections|chart_access_log/.test(s))).toBe(false);
  });

  it('reads private blobs with access: private', async () => {
    query.mockResolvedValueOnce([{ ...DOC, file_path: 'https://abc123.private.blob.vercel-storage.com/user_1/a-R4nd.pdf' }]);
    const res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(200);
    expect(get.mock.calls[0][1]).toMatchObject({ access: 'private' });
  });

  it("another user gets 404 (same as a missing document) and no file", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(OTHER);
    query.mockResolvedValueOnce([DOC]);  // document lookup
    query.mockResolvedValueOnce([]);     // no approved connection
    const res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(404);
    expect(get).not.toHaveBeenCalled();
    expect(res._data.length).toBe(0);
  });

  it('missing document: 404', async () => {
    query.mockResolvedValueOnce([]);
    const res = mockRes();
    await handler(mockReq('nope'), res);
    expect(res._status).toBe(404);
  });

  it('malformed id that makes Postgres throw: 404, not 500', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' }));
    const res = mockRes();
    await handler(mockReq('not-a-uuid'), res);
    expect(res._status).toBe(404);
  });

  it('approved doctor: gets the file and the read is logged to chart_access_log', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockResolvedValueOnce([DOC]);            // document lookup
    query.mockResolvedValueOnce([{ id: 'conn' }]); // approved connection
    query.mockResolvedValueOnce([]);               // audit insert
    const res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(200);
    expect(res._data.toString()).toBe('%PDF-1.4 test');
    const [connSql, connParams] = query.mock.calls[1] as [string, unknown[]];
    expect(connSql).toMatch(/status = 'approved'/);
    expect(connParams).toEqual([DOCTOR.id, PATIENT.id]);
    const [logSql, logParams] = query.mock.calls[2] as [string, unknown[]];
    expect(logSql).toMatch(/INSERT INTO chart_access_log/);
    expect(logSql).toMatch(/document_file/);
    expect(logParams).toEqual([DOCTOR.id, PATIENT.id]);
  });

  it('approved doctor still gets the file when the audit insert fails (best-effort log)', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockResolvedValueOnce([DOC]);
    query.mockResolvedValueOnce([{ id: 'conn' }]);
    query.mockRejectedValueOnce(new Error('log table down'));
    const res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(200);
  });

  it('pending (or revoked) doctor: 404, no file, no audit row', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockResolvedValueOnce([DOC]);
    query.mockResolvedValueOnce([]); // the 'approved' filter finds no row for a pending connection
    const res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(404);
    expect(get).not.toHaveBeenCalled();
    expect(sqlCalls().some(s => /chart_access_log/.test(s))).toBe(false);
  });

  it("refuses a row pointed at another user's blob or a non-Blob host", async () => {
    for (const file_path of [
      `${BASE}/user_2/their-scan-R4nd.pdf`,
      'https://evil.example/user_1/a.pdf',
      'http://abc123.public.blob.vercel-storage.com/user_1/a.pdf',
      'https://169.254.169.254/latest/meta-data',
      '',
      null,
    ]) {
      query.mockReset();
      query.mockResolvedValueOnce([{ ...DOC, file_path }]);
      const res = mockRes();
      await handler(mockReq('doc_a'), res);
      expect(res._status).toBe(404);
    }
    expect(get).not.toHaveBeenCalled();
  });

  it('blob gone: 404; Blob error: 502', async () => {
    query.mockResolvedValueOnce([DOC]);
    get.mockResolvedValueOnce(null);
    let res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(404);

    query.mockResolvedValueOnce([DOC]);
    get.mockRejectedValueOnce(new Error('Blob down'));
    res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._status).toBe(502);
  });

  it('never labels a response as HTML/SVG: unknown types download as octet-stream', async () => {
    query.mockResolvedValueOnce([{ ...DOC, mime_type: 'text/html', file_name: 'x.html' }]);
    get.mockResolvedValueOnce(blobOk('<script>alert(1)</script>', 'text/html'));
    const res = mockRes();
    await handler(mockReq('doc_a'), res);
    expect(res._headers['content-type']).toBe('application/octet-stream');
    expect(res._headers['content-disposition']).toMatch(/^attachment;/);
  });
});

describe('resolveContentType / contentDisposition', () => {
  it('maps allowed types, normalises image/jpg, downloads docx', () => {
    expect(resolveContentType('image/jpg', null, 'a.jpg')).toEqual({ type: 'image/jpeg', inline: true });
    expect(resolveContentType('', 'image/png', 'a')).toEqual({ type: 'image/png', inline: true });
    expect(resolveContentType('', '', 'scan.HEIC')).toEqual({ type: 'image/heic', inline: true });
    expect(resolveContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document', null, 'a.docx').inline).toBe(false);
    expect(resolveContentType('image/svg+xml', 'image/svg+xml', 'a.svg')).toEqual({ type: 'application/octet-stream', inline: false });
  });

  it('strips header-breaking characters and paths from the filename', () => {
    const h = contentDisposition('../../etc/pa"ss\r\nX-Evil: 1\\.pdf', true);
    expect(h).not.toMatch(/[\r\n]/);
    expect(h).toMatch(/^inline; filename="\.\.\.\.etcpassX-Evil: 1\.pdf"/);
    expect(contentDisposition('', false)).toBe(`attachment; filename="document"; filename*=UTF-8''document`);
  });
});
