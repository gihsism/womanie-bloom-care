import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../_lib/auth.js', () => ({ getAuthUser: vi.fn(async () => ({ id: 'user_1', email: 'u@test.com', sessionId: 's' })) }));
vi.mock('../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
const checkAndConsume = vi.fn();
vi.mock('../_lib/ratelimit.js', () => ({ checkAndConsume: (...a: unknown[]) => checkAndConsume(...a) }));
const callAnthropicWithRetry = vi.fn();
vi.mock('../_lib/anthropic.js', () => ({
  callAnthropicWithRetry: (...a: unknown[]) => callAnthropicWithRetry(...a),
  SONNET_MODEL: 'm',
  SONNET_NO_THINKING: {},
  replyText: (d: { text?: string }) => d.text,
}));

import generate from './generate';
import panel from './panel';

function mockRes() {
  const r = { _status: 200, _body: null as unknown } as unknown as VercelResponse & { _status: number; _body: unknown };
  Object.assign(r, { setHeader: vi.fn(), end: vi.fn() });
  r.status = ((c: number) => { r._status = c; return r; }) as VercelResponse['status'];
  r.json = ((d: unknown) => { r._body = d; return r; }) as VercelResponse['json'];
  return r;
}
const req = (body: unknown) => ({ method: 'POST', headers: {}, body }) as unknown as VercelRequest;

// Every edit to her own data (one cheap /api/db call) changes the cache
// key, so "only force=true is rate limited" left a Sonnet call per request
// unmetered. Fresh generations are now charged on a cache miss too.
describe('summary endpoints: fresh generations are rate limited', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    query.mockReset();
    checkAndConsume.mockReset();
    callAnthropicWithRetry.mockReset();
    callAnthropicWithRetry.mockResolvedValue({ json: async () => ({ text: 'summary' }) });
    checkAndConsume.mockResolvedValue({ ok: false, remaining: 0, limit: 1, retryInSec: 60 });
    query.mockImplementation(async (sql: string) => {
      if (/FROM health_documents/.test(sql)) return [{ file_name: 'a.pdf', ai_summary: 'fine' }];
      if (/FROM current_extracted_data/.test(sql)) return [{ title: 'Hb', value: '12', raw_data: { panel: 'CBC' } }];
      return []; // profiles, llm_cache miss
    });
  });

  it('summary/generate: 429 on a cache miss over the limit, no model call', async () => {
    const res = mockRes();
    await generate(req({}), res);
    expect(res._status).toBe(429);
    expect(callAnthropicWithRetry).not.toHaveBeenCalled();
  });

  it('summary/panel: 429 on a cache miss over the limit, no model call', async () => {
    const res = mockRes();
    await panel(req({ panel: 'CBC' }), res);
    expect(res._status).toBe(429);
    expect(callAnthropicWithRetry).not.toHaveBeenCalled();
  });

  it('cache hits are never charged', async () => {
    query.mockImplementation(async (sql: string) => {
      if (/FROM health_documents/.test(sql)) return [{ file_name: 'a.pdf', ai_summary: 'fine' }];
      if (/FROM current_extracted_data/.test(sql)) return [{ title: 'Hb', value: '12', raw_data: { panel: 'CBC' } }];
      if (/SELECT response_text/.test(sql)) return [{ response_text: 'cached', created_at: 'now' }];
      return [];
    });
    const res = mockRes();
    await panel(req({ panel: 'CBC' }), res);
    expect(res._status).toBe(200);
    expect(checkAndConsume).not.toHaveBeenCalled();
  });

  it('500 replies carry no internal error text', async () => {
    checkAndConsume.mockResolvedValue({ ok: true, remaining: 5, limit: 5, retryInSec: 0 });
    callAnthropicWithRetry.mockRejectedValue(new Error('Anthropic 401: invalid x-api-key sk-ant-SECRET'));
    for (const [h, body] of [[generate, {}], [panel, { panel: 'CBC' }]] as const) {
      const res = mockRes();
      await h(req(body), res);
      expect(res._status).toBe(500);
      expect(JSON.stringify(res._body)).not.toMatch(/SECRET|x-api-key/);
    }
  });
});
