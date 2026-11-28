import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Round 13: what the chat handler answers when the model call fails.
// The database, the research search and persistence are stubbed; the
// model API is a stubbed fetch, so no paid call is made.

vi.mock('@neondatabase/serverless', () => ({ neon: () => Object.assign(() => Promise.resolve([]), { query: vi.fn(async () => []) }) }));
vi.mock('./_lib/auth.js', () => ({ getAuthUser: vi.fn(async () => ({ id: 'user_1', email: 'a@test.com', sessionId: 's1' })) }));
vi.mock('./_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('./_lib/maintenance.js', () => ({ withMaintenance: (_r: string, h: unknown) => h }));
vi.mock('./_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn(async () => ({ ok: true, remaining: 1, limit: 150, retryInSec: 0 })) }));
const persistChatTurn = vi.fn(async () => 'msg-1');
vi.mock('./_lib/chatConversation.js', () => ({ parseConversationId: () => null, persistChatTurn: (...a: unknown[]) => persistChatTurn(...(a as [])) }));
vi.mock('./_lib/research/chat-prompt.js', () => ({
  selectChatEvidenceForTurn: vi.fn(async () => ({ researchItems: [], chatSources: [], passages: [], block: '' })),
  buildChatSystemPrompt: (m: string, e: string) => `SYSTEM ${m}${e}`,
}));

import handler from './ai-doctor-chat';

function mockRes() {
  const r = { _status: 200, _body: null as unknown, _written: [] as string[] } as unknown as VercelResponse & { _status: number; _body: unknown; _written: string[] };
  Object.assign(r, {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((s: string) => { r._written.push(s); return true; }),
    end: vi.fn(),
  });
  r.status = ((c: number) => { r._status = c; return r; }) as VercelResponse['status'];
  r.json = ((d: unknown) => { r._body = d; return r; }) as VercelResponse['json'];
  return r;
}

const req = () => ({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'Is coffee safe in pregnancy?' }] } }) as unknown as VercelRequest;

function sse(events: unknown[], { drop = false } = {}) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      if (drop) c.error(new TypeError('terminated'));
      else c.close();
    },
  });
}
const delta = (text: string) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } });

describe('POST /api/ai-doctor-chat: failures', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'k';
    process.env.DATABASE_URL = 'postgres://x';
    persistChatTurn.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a model error mid-answer: the page gets an error event, the half answer is not saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse([delta('Up to 200 mg '), { type: 'error', error: { type: 'overloaded_error' } }]), { status: 200 })));
    const res = mockRes();
    await handler(req(), res);
    const out = res._written.join('');
    expect(out).toContain('Up to 200 mg');
    expect(out).toContain('"error":{"message":"The answer stopped before it was finished. Please try again."}');
    expect(out.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(out).not.toContain('"meta"');
    expect(persistChatTurn).not.toHaveBeenCalled();
  });

  it('the connection to the model drops mid-answer: same error event, nothing saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse([delta('Up to 200 mg ')], { drop: true }), { status: 200 })));
    const res = mockRes();
    await handler(req(), res);
    expect(res._written.join('')).toContain('"error":{"message"');
    expect(persistChatTurn).not.toHaveBeenCalled();
  });

  it('a complete answer is saved and ends with meta + [DONE]', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse([delta('Most advice says up to 200 mg a day.')]), { status: 200 })));
    const res = mockRes();
    await handler(req(), res);
    const out = res._written.join('');
    expect(out).toContain('"meta"');
    expect(out).not.toContain('"error"');
    expect(persistChatTurn).toHaveBeenCalledTimes(1);
  });

  it('a handshake timeout is a 504 in the page\'s words, not retried', async () => {
    const fetchMock = vi.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(504);
    expect(res._body).toEqual({ error: 'Ask AI took too long to answer. Please try again.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the model API rate limit is a 429 that says to wait', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"type":"error"}', { status: 429 })));
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(429);
    expect((res._body as { error: string }).error).toMatch(/busy right now/);
  });

  it('overloaded three times: 503 after the retries', async () => {
    const fetchMock = vi.fn(async () => new Response('{"type":"error"}', { status: 529 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(req(), res);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res._status).toBe(503);
    expect((res._body as { error: string }).error).toMatch(/busy or unavailable/);
  }, 10_000);
});
