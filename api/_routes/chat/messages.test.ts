import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './messages';
import { getAuthUser } from '../../_lib/auth.js';

const USER = { id: 'user_abc123', email: 'alice@test.com', sessionId: 'sess_1' };

// Simulate DB returning rows in DESC (newest-first) order, as the handler
// queries with ORDER BY created_at DESC.
const MSG_ROWS_DESC = [
  { id: 'm2', role: 'assistant', content: 'hi', model: 'claude', created_at: '2026-01-01T00:00:02Z' },
  { id: 'm1', role: 'user', content: 'hello', model: null, created_at: '2026-01-01T00:00:01Z' },
];

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

function mockReq(method = 'GET', bodyData?: unknown, queryParams?: Record<string, string>): VercelRequest {
  return {
    method,
    headers: { cookie: 'womanie_session=fake' },
    query: queryParams ?? {},
    body: bodyData ?? {},
  } as unknown as VercelRequest;
}

describe('chat/messages security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    query.mockResolvedValue(MSG_ROWS_DESC);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for unsupported methods', async () => {
    for (const method of ['PUT', 'PATCH', 'OPTIONS']) {
      const res = mockRes();
      await handler(mockReq(method), res);
      expect(res._status).toBe(405);
    }
  });

  // Ownership invariant for GET: the SELECT must bind the session user's id
  // as $1. A refactor that dropped this filter or trusted a query param
  // would let any authenticated user read another user's chat history.
  it('GET: binds session user id as $1 in the SELECT', async () => {
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(USER.id);
  });

  // The handler reverses the DB's DESC result so the client receives
  // messages in oldest-first (natural reading) order.
  it('GET: returns messages in oldest-first order', async () => {
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res._status).toBe(200);
    const body = res._body as { messages: Array<{ id: string }>; hasMore: boolean };
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages[0].id).toBe('m1');
    expect(body.messages[1].id).toBe('m2');
  });

  it('POST: returns 400 when messages body is not an array', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { messages: 'not an array' }), res);
    expect(res._status).toBe(400);
  });

  // Idempotency guard: if the user already has server-side messages the
  // import is skipped. Without this guard a stale localStorage copy could
  // silently overwrite the canonical server history on every sign-in.
  it('POST: skips import when user already has messages on the server', async () => {
    query.mockResolvedValue([{ 1: 1 }]); // existence check returns a row
    const res = mockRes();
    await handler(mockReq('POST', { messages: [{ role: 'user', content: 'hi' }] }), res);
    expect(res._status).toBe(200);
    const body = res._body as { imported: number; reason: string };
    expect(body.imported).toBe(0);
    expect(body.reason).toBe('user already has messages');
  });

  // Ownership invariant for POST INSERT: $1 must be the session user's id,
  // never a client-supplied value. A refactor trusting req.body.userId would
  // let an attacker plant messages in another user's chat history.
  it('POST: binds session user id as $1 in the INSERT', async () => {
    query
      .mockResolvedValueOnce([])              // existence check: no existing messages
      .mockResolvedValueOnce([{ id: 'm_new' }]); // INSERT RETURNING
    const res = mockRes();
    await handler(
      mockReq('POST', { messages: [{ role: 'user', content: 'hello' }] }),
      res
    );
    expect(res._status).toBe(200);
    const insertCall = query.mock.calls[1] as [string, unknown[]];
    expect(insertCall[1][0]).toBe(USER.id);
  });

  // Ownership invariant for DELETE — the most dangerous path: the DELETE
  // must bind user.id as $1 in its WHERE clause. Dropping the filter would
  // let one authenticated user silently wipe every other user's chat history.
  it('DELETE: binds session user id as $1 and scopes the DELETE by user_id', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq('DELETE'), res);
    expect(res._status).toBe(200);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/DELETE FROM chat_messages WHERE user_id\s*=\s*\$1/i);
    expect(params[0]).toBe(USER.id);
  });

  it('DELETE: returns {cleared: true} on success', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq('DELETE'), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ cleared: true });
  });

  // Conversations (migration 013): GET returns conversation_id, still
  // scoped to the session user, and still works before the migration.
  it('GET: selects conversation_id and filters by the session user only', async () => {
    const res = mockRes();
    await handler(mockReq('GET', undefined, { userId: 'someone_else' }), res);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/conversation_id/);
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(params[0]).toBe(USER.id);
    expect(params).not.toContain('someone_else');
  });

  it('GET: falls back to the old columns when conversation_id does not exist yet', async () => {
    query
      .mockRejectedValueOnce(Object.assign(new Error('column "conversation_id" does not exist'), { code: '42703' }))
      .mockResolvedValueOnce(MSG_ROWS_DESC);
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res._status).toBe(200);
    const [retrySql, retryParams] = query.mock.calls[1] as [string, unknown[]];
    expect(retrySql).not.toMatch(/conversation_id/);
    expect(retryParams[0]).toBe(USER.id);
    expect((res._body as { messages: unknown[] }).messages).toHaveLength(2);
  });

  it('GET: other database errors are not swallowed by the fallback', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '08006' }));
    await expect(handler(mockReq('GET'), mockRes())).rejects.toThrow('boom');
  });

  // A turn is saved in one transaction, so the question and the answer
  // share created_at. Live, 4 of 25 pairs came back answer-first.
  it('GET: a question sorts before its answer when both share created_at', async () => {
    const queries: Array<Record<string, string>> = [{}, { before: '2026-11-26T00:00:00Z' }];
    for (const q of queries) {
      query.mockClear();
      await handler(mockReq('GET', undefined, q), mockRes());
      const [sql] = query.mock.calls[0] as [string];
      // Newest-first in SQL (reversed for the client): the answer row first.
      expect(sql).toMatch(/ORDER BY created_at DESC, CASE role WHEN 'user' THEN 1 ELSE 0 END/);
    }
  });
});
