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
  r.setHeader = vi.fn() as unknown as VercelResponse['setHeader'];
  r.status = ((c: number) => { r._status = c; return r; }) as VercelResponse['status'];
  r.json = ((d: unknown) => { r._body = d; return r; }) as VercelResponse['json'];
  r.end = vi.fn() as unknown as VercelResponse['end'];
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
