import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './conversation';
import { getAuthUser } from '../../_lib/auth.js';

const USER = { id: 'user_abc123', email: 'alice@test.com', sessionId: 'sess_1' };
const CID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const M1 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const M2 = '16fd2706-8baf-433b-82eb-8c7fada847da';

function mockRes() {
  let status = 200;
  const body: { _status: number; _body: unknown } & Partial<VercelResponse> = { _status: 200, _body: null };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

const req = (method: string, body?: unknown) =>
  ({ method, headers: { cookie: 'womanie_session=fake' }, query: {}, body: body ?? {} }) as unknown as VercelRequest;

describe('DELETE /api/chat/conversation (one chat)', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    query.mockResolvedValue([{ id: M1 }, { id: M2 }]);
  });

  it('401 without a session, and never touches the database', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req('DELETE', { conversationId: CID }), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('405 for anything but DELETE', async () => {
    for (const m of ['GET', 'POST', 'PUT']) {
      const res = mockRes();
      await handler(req(m, { conversationId: CID }), res);
      expect(res._status).toBe(405);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes by conversation_id, scoped to the session user as $1', async () => {
    const res = mockRes();
    await handler(req('DELETE', { conversationId: CID.toUpperCase(), userId: 'someone_else' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ deleted: 2 });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/DELETE FROM chat_messages WHERE user_id = \$1 AND conversation_id = \$2/);
    expect(params).toEqual([USER.id, CID]);
  });

  it('deletes an old chat (no conversation id) by its message ids, scoped to the session user', async () => {
    const res = mockRes();
    await handler(req('DELETE', { messageIds: [M1, M2] }), res);
    expect(res._status).toBe(200);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE user_id = \$1 AND id = ANY\(\$2::uuid\[\]\)/);
    expect(params).toEqual([USER.id, [M1, M2]]);
  });

  it("404 when nothing matched (another user's chat, or already gone)", async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(req('DELETE', { conversationId: CID }), res);
    expect(res._status).toBe(404);
  });

  it('400 for a missing or malformed id, without a query (never a user-wide delete)', async () => {
    const bodies = [{}, { conversationId: 'abc' }, { messageIds: [] }, { messageIds: ['x'] }, { messageIds: 'nope' },
      { messageIds: Array.from({ length: 501 }, () => M1) }];
    for (const b of bodies) {
      const res = mockRes();
      await handler(req('DELETE', b), res);
      expect(res._status, JSON.stringify(b).slice(0, 40)).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
});
