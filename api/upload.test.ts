import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('./_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('./_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
const put = vi.fn();
vi.mock('@vercel/blob', () => ({ put: (...a: unknown[]) => put(...a) }));

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
