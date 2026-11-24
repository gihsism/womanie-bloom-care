import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// neon() returns a tagged-template-literal function that also carries .query and
// .transaction as methods. tagFn covers the template-literal DELETE calls inside
// sql.transaction([]), query covers the ownership-check SELECT, and transaction
// covers the atomic batch commit.
const query = vi.fn();
const transaction = vi.fn();
const tagFn = vi.fn();
vi.mock('@neondatabase/serverless', () => ({
  neon: () => Object.assign(tagFn, { query, transaction }),
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn() }));
import { del } from '@vercel/blob';
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './delete';
import { getAuthUser } from '../../_lib/auth.js';

const SESSION_USER = { id: 'user_1', email: 'u@test.com', sessionId: 'sess_1' };
const DOC_ID = 'doc_abc123';
const DOC_ROW = [{ file_path: null }];

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

function mockReq(b: unknown, method = 'POST'): VercelRequest {
  return {
    method,
    headers: { cookie: 'womanie_session=fake' },
    body: b,
  } as unknown as VercelRequest;
}

describe('docs/delete security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    // Ownership-check SELECT returns one row by default (document found).
    query.mockResolvedValue(DOC_ROW);
    transaction.mockReset();
    transaction.mockResolvedValue([]);
    tagFn.mockReset();
    // Each sql`DELETE ...` tagged-template call returns a promise that is
    // collected into the array passed to sql.transaction([]).
    tagFn.mockReturnValue(Promise.resolve([]));
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ documentId: DOC_ID }, 'GET'), res);
    expect(res._status).toBe(405);
  });

  it('returns 400 when documentId is missing', async () => {
    const res = mockRes();
    await handler(mockReq({}), res);
    expect(res._status).toBe(400);
  });

  it('returns 404 when the document is not found or does not belong to the session user', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res);
    expect(res._status).toBe(404);
  });

  // Ownership invariant: the SELECT that checks document existence must bind the
  // session user's id (not a client-supplied value) as the user_id filter.
  // Without this check, any authenticated user could delete another user's documents
  // by guessing a document UUID, since the transaction queries also run against that id.
  it('ownership SELECT binds session user id as the user_id filter (not client-supplied)', async () => {
    const res = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res);
    expect(query).toHaveBeenCalled();
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/user_id\s*=\s*\$2/i);
    expect(params[0]).toBe(DOC_ID);
    expect(params[1]).toBe(SESSION_USER.id);
  });

  // Atomicity invariant: extracted data, document analyses, and the document row
  // itself must all be deleted inside a single sql.transaction([...]) call.
  // Sequential sql.query() calls would not be atomic — a mid-flight failure would
  // leave orphaned rows (e.g. extracted data with no parent document) with no way
  // to recover, since a retry would find the document already gone.
  it('runs the 3-step cascade DELETE inside a single atomic transaction', async () => {
    const res = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res);
    expect(transaction).toHaveBeenCalledOnce();
    const [txArgs] = transaction.mock.calls[0] as [unknown[]];
    expect(Array.isArray(txArgs)).toBe(true);
    expect(txArgs).toHaveLength(3);
  });

  // Defense-in-depth guard: even though ownership was verified by the preliminary
  // SELECT, each DELETE in the transaction should also filter by user_id. This
  // prevents a refactored handler that removed the preliminary SELECT from silently
  // deleting another user's data.
  it('transaction DELETE statements bind the session user id (defense-in-depth)', async () => {
    const res = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res);
    // tagFn is called once per sql`...` template literal inside the transaction array.
    // Each call receives (strings, ...values) where values include documentId and user.id.
    const userIdBound = tagFn.mock.calls.some((args: unknown[]) =>
      args.slice(1).includes(SESSION_USER.id)
    );
    expect(userIdBound).toBe(true);
  });

  it('returns 200 with success: true on successful deletion', async () => {
    const res = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });
  it('deletes the blob only when it is in the caller\'s own upload folder', async () => {
    const base = 'https://abc.public.blob.vercel-storage.com';
    vi.mocked(del).mockClear();
    query.mockResolvedValueOnce([{ file_path: `${base}/user_2/their-scan.pdf` }]);
    const res1 = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res1);
    expect(res1._status).toBe(200);
    expect(del).not.toHaveBeenCalled();

    query.mockResolvedValueOnce([{ file_path: `${base}/user_1/my-scan.pdf` }]);
    const res2 = mockRes();
    await handler(mockReq({ documentId: DOC_ID }), res2);
    expect(del).toHaveBeenCalledWith(`${base}/user_1/my-scan.pdf`, expect.anything());
  });
});
