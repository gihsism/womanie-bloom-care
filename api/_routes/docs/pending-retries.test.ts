import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './pending-retries';
import { getAuthUser } from '../../_lib/auth.js';
import { ROUTES } from '../../router';

const SESSION_USER = { id: 'user_1', email: 'u@test.com', sessionId: 'sess_1' };
const DOC = { id: 'doc_abc', file_name: 'labs.pdf', mime_type: 'application/pdf' };

function mockRes() {
  const r = { _status: 200, _body: null as unknown } as unknown as VercelResponse & {
    _status: number; _body: unknown;
  };
  Object.assign(r, { setHeader: vi.fn(), end: vi.fn() });
  r.status = ((c: number) => { r._status = c; return r; }) as VercelResponse['status'];
  r.json = ((d: unknown) => { r._body = d; return r; }) as VercelResponse['json'];
  return r;
}

function mockReq(method = 'POST'): VercelRequest {
  return { method, headers: { cookie: 'womanie_session=tok' }, body: {}, query: {} } as unknown as VercelRequest;
}

describe('docs/pending-retries security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    query.mockResolvedValue([]);
  });

  it('is routed through api/router (no new top-level function)', () => {
    expect(ROUTES['docs/pending-retries']).toBe(handler);
  });

  it('returns 401 when the session is invalid without touching the database', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 405 for non-POST methods without touching the database', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = mockRes();
      await handler(mockReq(method), res);
      expect(res._status).toBe(405);
    }
    expect(query).not.toHaveBeenCalled();
  });

  // Ownership invariant: the candidates SELECT must bind the session user's id as $1
  // via WHERE h.user_id = $1. Without this, any authenticated user could enumerate all
  // other users' un-analyzed health documents by calling this endpoint, learning whether
  // they have pending documents and triggering re-analysis on them.
  it('ownership invariant: candidates SELECT binds session user id as $1', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(query).toHaveBeenCalled();
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE.*h\.user_id\s*=\s*\$1/i);
    expect(params[0]).toBe(SESSION_USER.id);
  });

  // Regression guard: confirms the first positional parameter is the session user's id,
  // not any client-supplied value. A refactor substituting req.body.userId would let any
  // authenticated user scan another user's pending document list.
  it('regression guard: WHERE user_id filter is bound to the session user, not client input', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(SESSION_USER.id);
    expect(params[0]).not.toBe('injected-id');
  });

  it('200 with empty retries array when no candidates exist', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    expect((res._body as { retries: unknown[] }).retries).toEqual([]);
  });

  // pending_jobs INSERT ownership: the INSERT must bind user.id as $2 (the user_id
  // column). Without this, the pending_jobs row would have no owner, and a later
  // UPDATE could be applied to documents belonging to a different user.
  it('pending_jobs INSERT binds session user id as $2 (ownership on write)', async () => {
    query
      .mockResolvedValueOnce([DOC])  // candidates
      .mockResolvedValueOnce([])      // pending_jobs check: no existing row
      .mockResolvedValueOnce([]);     // INSERT
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const retries = (res._body as { retries: { documentId: string; fileName: string | null }[] }).retries;
    expect(retries).toHaveLength(1);
    expect(retries[0].documentId).toBe(DOC.id);
    const insertCall = query.mock.calls.find((args) =>
      String(args[0]).includes('INSERT INTO pending_jobs'),
    );
    expect(insertCall).toBeDefined();
    const insertParams = (insertCall as [string, unknown[]])[1];
    expect(insertParams[1]).toBe(SESSION_USER.id);
  });

  // MAX_ATTEMPTS cap: when attempts >= 3, the endpoint marks the job as failed and
  // does not return the document to the client. This prevents an un-analyzable document
  // from re-firing on every page load.
  it('skips a document at MAX_ATTEMPTS (3), marks it failed, returns empty retries', async () => {
    query
      .mockResolvedValueOnce([DOC])   // candidates
      .mockResolvedValueOnce([{       // pending_jobs: 3 attempts, stale (not recent)
        status: 'pending',
        attempts: 3,
        updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      }])
      .mockResolvedValueOnce([]);     // UPDATE to 'failed'
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    expect((res._body as { retries: unknown[] }).retries).toHaveLength(0);
    const updateCall = query.mock.calls.find((args) =>
      String(args[0]).includes("status = 'failed'"),
    );
    expect(updateCall).toBeDefined();
  });

  it('500 on a database error', async () => {
    query.mockRejectedValueOnce(new Error('connection refused'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
  });
});
