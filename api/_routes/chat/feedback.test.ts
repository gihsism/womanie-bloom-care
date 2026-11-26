import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn(async () => ({ ok: true })) }));

import handler from './feedback';
import { getAuthUser } from '../../_lib/auth.js';
import { parseChatFeedback } from '../../_lib/chat-feedback';
import { ROUTES } from '../../router';

const USER = { id: 'user_f1', email: 'f@test.com', sessionId: 's' };
const MSG = '3f2b8c1e-9a4d-4e6f-8b21-7c5d9e0a1b2c';

function mockRes() {
  const r: { _status: number; _body: unknown } & Partial<VercelResponse> = { _status: 200, _body: null };
  r.setHeader = vi.fn() as never;
  r.end = vi.fn() as never;
  r.status = (c: number) => { r._status = c; return r as unknown as VercelResponse; };
  r.json = (d: unknown) => { r._body = d; return r as unknown as VercelResponse; };
  return r as typeof r & VercelResponse;
}
const req = (method: string, body?: unknown) => ({ method, headers: {}, body, query: {} }) as unknown as VercelRequest;

describe('parseChatFeedback', () => {
  it('accepts a rating with a reason and her comment, trimmed and capped', () => {
    const r = parseChatFeedback({ answerKey: MSG, messageId: MSG.toUpperCase(), rating: -1, reason: 'wrong', comment: `  ${'a'.repeat(600)} ` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feedback.messageId).toBe(MSG);
    expect(r.feedback.comment).toHaveLength(500);
  });
  it('adds nothing she did not choose or type', () => {
    const r = parseChatFeedback({ answerKey: 'abcdef12', rating: 1, name: 'Anna', answer: 'secret' });
    expect(r.ok && r.feedback).toEqual({ answerKey: 'abcdef12', messageId: null, conversationId: null, model: null, rating: 1, reason: null, comment: null });
  });
  it('rejects bad ratings, reasons and keys', () => {
    for (const b of [null, {}, { answerKey: 'abcdef12', rating: 2 }, { answerKey: 'abcdef12', rating: 1, reason: 'meh' }, { answerKey: 'x', rating: 1 }, { answerKey: "a'; drop", rating: 1 }]) {
      expect(parseChatFeedback(b).ok).toBe(false);
    }
  });
});

describe('POST /api/chat/feedback', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
  });

  it('is routed through api/router.ts', () => {
    expect(ROUTES['chat/feedback']).toBe(handler);
  });

  it('requires a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req('POST', { answerKey: MSG, rating: 1 }), res);
    expect(res._status).toBe(401);
  });

  it('stores the rating owned by the session user (upsert per answer)', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(req('POST', { answerKey: MSG, messageId: MSG, rating: -1, reason: 'unclear', comment: 'too vague', user_id: 'someone_else' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ stored: true });
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    expect(text).toMatch(/INSERT INTO chat_feedback/);
    expect(text).toMatch(/ON CONFLICT \(user_id, answer_key\)/);
    expect(params[0]).toBe(USER.id);
    expect(params).toEqual([USER.id, MSG, MSG, null, null, -1, 'unclear', 'too vague']);
  });

  it('before migration 026: 200 stored:false, so the page keeps it locally', async () => {
    query.mockRejectedValue(Object.assign(new Error('relation "chat_feedback" does not exist'), { code: '42P01' }));
    const res = mockRes();
    await handler(req('POST', { answerKey: MSG, rating: 1 }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ stored: false, reason: 'not_available' });
  });

  it('400 on a malformed body, writes nothing; 405 on GET', async () => {
    const res = mockRes();
    await handler(req('POST', { rating: 5 }), res);
    expect(res._status).toBe(400);
    const res2 = mockRes();
    await handler(req('GET'), res2);
    expect(res2._status).toBe(405);
    expect(query).not.toHaveBeenCalled();
  });
});
