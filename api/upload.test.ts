import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('./_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('./_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
const put = vi.fn();
vi.mock('@vercel/blob', () => ({ put: (...a: unknown[]) => put(...a) }));
const handleUpload = vi.fn();
vi.mock('@vercel/blob/client', () => ({ handleUpload: (...a: unknown[]) => handleUpload(...a) }));
const neonQuery = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query: neonQuery }) }));

import handler from './upload';
import { getAuthUser } from './_lib/auth.js';

const USER = { id: 'user_1', email: 'd@test.com', sessionId: 's1' };

function mockRes() {
  const r = { _status: 200, _body: null as unknown } as unknown as VercelResponse & { _status: number; _body: unknown };
  Object.assign(r, { setHeader: vi.fn(), end: vi.fn() });
  r.status = ((c: number) => { r._status = c; return r; }) as VercelResponse['status'];
  r.json = ((d: unknown) => { r._body = d; return r; }) as VercelResponse['json'];
  return r;
}

function putReq(filename: string, contentType: string, length = 1000): VercelRequest {
  return {
    method: 'PUT',
    query: { filename },
    headers: { cookie: 'womanie_session=fake', 'content-type': contentType, 'content-length': String(length) },
  } as unknown as VercelRequest;
}

// The legacy PUT path is only used for doctor avatars (DoctorProfileEditor:
// JPG/PNG/WebP, max 5 MB). It returns a public Blob URL, so without limits
// any signed-in account could host arbitrary files (HTML, scripts) of any
// size on the store's domain.
describe('PUT /api/upload (avatar path)', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ url: 'https://x.public.blob.vercel-storage.com/user_1/a.png', pathname: 'user_1/a.png' });
    vi.mocked(getAuthUser).mockResolvedValue(USER);
  });

  it('accepts a small image', async () => {
    const res = mockRes();
    await handler(putReq('user_1/avatar-1.png', 'image/png'), res);
    expect(res._status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('refuses non-image files by extension or type', async () => {
    for (const [name, type] of [['user_1/x.html', 'text/html'], ['user_1/x.png', 'text/html'], ['user_1/x.svg', 'image/svg+xml'], ['user_1/x.js', 'image/png']]) {
      const res = mockRes();
      await handler(putReq(name, type), res);
      expect(res._status).toBe(400);
    }
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses files over 5 MB or with no declared length', async () => {
    let res = mockRes();
    await handler(putReq('user_1/a.png', 'image/png', 6 * 1024 * 1024), res);
    expect(res._status).toBe(413);
    res = mockRes();
    const noLen = putReq('user_1/a.png', 'image/png');
    delete (noLen.headers as Record<string, string>)['content-length'];
    await handler(noLen, res);
    expect(res._status).toBe(411);
    expect(put).not.toHaveBeenCalled();
  });

  it('error replies carry no internal error text', async () => {
    put.mockRejectedValue(new Error('BlobError: token vercel_blob_rw_SECRET invalid'));
    const res = mockRes();
    await handler(putReq('user_1/a.png', 'image/png'), res);
    expect(res._status).toBe(500);
    expect(JSON.stringify(res._body)).not.toMatch(/SECRET|BlobError/);
  });
});

// Doctor -> patient documents: the upload token for <patient id>/... is
// issued only to an account that still holds the doctor role AND has an
// approved connection to that patient. The limits stay the patient's.
describe('POST /api/upload token (doctor sending into a patient folder)', () => {
  const state = {
    roles: new Set<string>(),
    approved: [] as Array<[string, string, string]>,
  };

  beforeEach(() => {
    state.roles = new Set(['user_1']);
    state.approved = [['user_1', 'pat_1', 'approved'], ['doc_other', 'pat_2', 'approved']];
    neonQuery.mockReset();
    neonQuery.mockImplementation(async (_sql: string, params: string[]) => {
      const [doctorId, patientId] = params;
      return state.roles.has(doctorId) && state.approved.some(([d, p, s]) => d === doctorId && p === patientId && s === 'approved')
        ? [{ id: 'c1' }] : [];
    });
    handleUpload.mockReset();
    handleUpload.mockImplementation(async (opts: { body: { pathname: string; payload: string | null } ; onBeforeGenerateToken: (p: string, c: string | null, m: boolean) => Promise<unknown> }) => {
      const tokenOpts = await opts.onBeforeGenerateToken(opts.body.pathname, opts.body.payload, false);
      return { type: 'blob.generate-client-token', clientToken: 'tok', tokenOpts };
    });
    vi.mocked(getAuthUser).mockResolvedValue(USER);
  });

  async function ask(pathname: string, payload: unknown) {
    const res = mockRes();
    const body = Buffer.from(JSON.stringify({ pathname, payload: payload === null ? null : JSON.stringify(payload) }));
    const req = {
      method: 'POST',
      headers: {},
      query: {},
      async *[Symbol.asyncIterator]() { yield body; },
    } as unknown as VercelRequest;
    await handler(req, res);
    return res;
  }

  it("still lets a user upload into her own folder with the patient limits", async () => {
    const res = await ask('user_1/1-lab.pdf', null);
    expect(res._status).toBe(200);
    const t = (res._body as { tokenOpts: { maximumSizeInBytes: number; allowedContentTypes: string[] } }).tokenOpts;
    expect(t.maximumSizeInBytes).toBe(200 * 1024 * 1024);
    expect(t.allowedContentTypes).toContain('application/pdf');
    expect(t.allowedContentTypes).not.toContain('text/html');
    expect(neonQuery).not.toHaveBeenCalled();
  });

  it('issues a token for the patient folder to an approved, verified doctor (same limits)', async () => {
    const res = await ask('pat_1/1-lab.pdf', { forPatient: 'pat_1' });
    expect(res._status).toBe(200);
    const t = (res._body as { tokenOpts: { maximumSizeInBytes: number; tokenPayload: string } }).tokenOpts;
    expect(t.maximumSizeInBytes).toBe(200 * 1024 * 1024);
    expect(JSON.parse(t.tokenPayload)).toEqual({ userId: 'user_1', ownerId: 'pat_1' });
  });

  it('refuses a revoked doctor (role gone, connection row left)', async () => {
    state.roles.clear();
    const res = await ask('pat_1/1-lab.pdf', { forPatient: 'pat_1' });
    expect(res._status).toBe(400);
  });

  it('refuses a pending connection', async () => {
    state.approved = [['user_1', 'pat_1', 'pending']];
    const res = await ask('pat_1/1-lab.pdf', { forPatient: 'pat_1' });
    expect(res._status).toBe(400);
  });

  it("refuses another doctor's patient", async () => {
    const res = await ask('pat_2/1-lab.pdf', { forPatient: 'pat_2' });
    expect(res._status).toBe(400);
  });

  it('refuses a patient folder without the payload, or a path outside the named patient', async () => {
    expect((await ask('pat_1/1-lab.pdf', null))._status).toBe(400);
    expect((await ask('pat_2/1-lab.pdf', { forPatient: 'pat_1' }))._status).toBe(400);
    expect((await ask('pat_1/../pat_2/x.pdf', { forPatient: 'pat_1' }))._status).toBe(400);
  });
});
