// End-to-end check of the research sources in the AI chat handler: the
// sources injected into the system prompt are exactly the ones streamed
// back to the page, and the stored reply keeps only the cited ones.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const inserts: unknown[][] = [];
vi.mock('@neondatabase/serverless', () => ({
  neon: () => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      inserts.push(values);
      return { strings, values };
    };
    sql.query = query;
    sql.transaction = vi.fn(async () => []);
    return sql;
  },
}));
vi.mock('../auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../ratelimit.js', () => ({
  checkAndConsume: vi.fn(async () => ({ ok: true, remaining: 100, limit: 150, retryInSec: 0 })),
}));

import handler from '../../ai-doctor-chat';
import { getAuthUser } from '../auth.js';
import { selectChatSourcesHybrid } from './hybrid';

const USER = { id: 'user_abc', email: 'a@test.com', sessionId: 's1' };

function sseStream(text: string) {
  const enc = new TextEncoder();
  const events = [
    { type: 'message_start' },
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    { type: 'message_stop' },
  ];
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
}

function mockRes() {
  const written: string[] = [];
  const res = {
    _status: 200,
    _body: null as unknown,
    written,
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: (chunk: string) => { written.push(chunk); return true; },
    end: vi.fn(),
    status(code: number) { res._status = code; return res; },
    json(data: unknown) { res._body = data; return res; },
  };
  return res;
}

function req(content: string): VercelRequest {
  return {
    method: 'POST',
    headers: {},
    query: {},
    body: { messages: [{ role: 'user', content }], model: 'claude-sonnet-5-5' },
  } as unknown as VercelRequest;
}

describe('ai-doctor-chat research sources', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let answer = '';

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgres://test';
    inserts.length = 0;
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    // profile row says pregnancy; every other query returns nothing.
    query.mockImplementation(async (sqlText: string) =>
      /FROM profiles/.test(sqlText) ? [{ full_name: 'Test', life_stage: 'pregnancy' }] : []);
    fetchMock = vi.fn(async () => new Response(sseStream(answer), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('injects numbered sources and streams back the same list first', async () => {
    answer = 'Up to about 200 mg of caffeine a day is usually fine [1].';
    const question = 'Is coffee OK in pregnancy?';
    // The handler uses the hybrid search (bundled model, keyword fallback).
    const expected = await selectChatSourcesHybrid(question, 'pregnancy');
    expect(expected.length).toBeGreaterThanOrEqual(3);

    const res = mockRes();
    await handler(req(question), res as unknown as VercelResponse);

    // What the model was given
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expected.forEach((it, i) => expect(body.system).toContain(`[${i + 1}] ${it.title}`));
    expect(body.system).not.toContain(`[${expected.length + 1}] `);
    expect(body.system).toMatch(/Cite only sources you actually used/);
    expect(body.system).toMatch(/Never carry a dose/);
    expect(body.system).toMatch(/Fewer, accurate citations/);
    expected.forEach((it) => expect(body.system).toContain(`Finding: ${it.summary}`));

    // What the page receives: the first SSE event carries the same list
    const first = JSON.parse(res.written[0].replace(/^data: /, ''));
    expect(first.sources.map((s: { pmid: string }) => s.pmid)).toEqual(expected.map((e) => e.pmid));
    expect(first.sources.map((s: { n: number }) => s.n)).toEqual(expected.map((_, i) => i + 1));
    expect(res.written.some((w) => w.includes('caffeine a day'))).toBe(true);
    expect(res.written[res.written.length - 1]).toBe('data: [DONE]\n\n');

    // Stored reply: answer + footer with only the cited source [1]
    const stored = inserts.find((v) => typeof v[1] === 'string' && (v[1] as string).startsWith('Up to about'));
    expect(stored).toBeDefined();
    const text = stored![1] as string;
    expect(text).toContain('**Sources**');
    expect(text).toContain(expected[0].url);
    if (expected[1]) expect(text).not.toContain(expected[1].url);
  });

  it('sends no sources event and forbids citations when nothing matches', async () => {
    answer = 'Hello!';
    const res = mockRes();
    await handler(req('hi there'), res as unknown as VercelResponse);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.system).toMatch(/Do not cite any sources/);
    expect(res.written.some((w) => w.includes('"sources"'))).toBe(false);
  });

  it('strips stored Sources footers from history before sending it to the model', async () => {
    answer = 'Ok.';
    const res = mockRes();
    const r = req('And tea?');
    (r.body as { messages: unknown[] }).messages = [
      { role: 'user', content: 'Is coffee OK in pregnancy?' },
      { role: 'assistant', content: 'Moderate is fine [1].\n\n---\n**Sources**\n- [1] [X](https://pubmed.ncbi.nlm.nih.gov/1/) — Y, 2020' },
      { role: 'user', content: 'And tea?' },
    ];
    await handler(r, res as unknown as VercelResponse);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages[1].content).toBe('Moderate is fine [1].');
  });

  it('drops invented citation numbers from the stored reply', async () => {
    const question = 'Is coffee OK in pregnancy?';
    const n = (await selectChatSourcesHybrid(question, 'pregnancy')).length;
    answer = `Keep caffeine moderate [1]. Some say more is fine [${n + 3}].`;
    const res = mockRes();
    await handler(req(question), res as unknown as VercelResponse);
    const stored = inserts.find((v) => typeof v[1] === 'string' && (v[1] as string).startsWith('Keep caffeine'));
    expect(stored).toBeDefined();
    const text = stored![1] as string;
    expect(text.split('\n\n---')[0]).toBe('Keep caffeine moderate [1]. Some say more is fine.');
    expect(text).not.toContain(`[${n + 3}]`);
  });

  it('removes a citation whose source never names the medicine, streams the fix and saves it', async () => {
    const question = 'Is coffee OK in pregnancy?';
    const items = await selectChatSourcesHybrid(question, 'pregnancy');
    expect(items.some((it) => /gabapentin/i.test(`${it.title} ${it.summary} ${it.keyPoints.join(' ')}`))).toBe(false);
    answer = 'Gabapentin can cause dizziness [1].';
    const res = mockRes();
    await handler(req(question), res as unknown as VercelResponse);

    // The page streamed the raw text, then gets the cleaned text before [DONE].
    const replace = res.written.find((w) => w.includes('"replace"'));
    expect(replace).toBeDefined();
    expect(JSON.parse(replace!.replace(/^data: /, '')).replace).toBe('Gabapentin can cause dizziness.');
    // ...followed only by the answer's extras (follow-ups, record chips).
    expect(res.written.indexOf(replace!)).toBe(res.written.length - 3);
    expect(res.written[res.written.length - 2]).toContain('"meta"');

    const stored = inserts.find((v) => typeof v[1] === 'string' && (v[1] as string).startsWith('Gabapentin'));
    expect(stored![1]).toBe('Gabapentin can cause dizziness.');
  });

  it('sends no replace event when every citation holds', async () => {
    answer = 'Keep caffeine moderate [1].';
    const res = mockRes();
    await handler(req('Is coffee OK in pregnancy?'), res as unknown as VercelResponse);
    expect(res.written.some((w) => w.includes('"replace"'))).toBe(false);
  });

  it('rejects an over-long new message before calling the model', async () => {
    const res = mockRes();
    await handler(req('x'.repeat(8001)), res as unknown as VercelResponse);
    expect(res._status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the latest turns of a very long history to the model', async () => {
    answer = 'Fine [1].';
    const history = Array.from({ length: 120 }, (_, i) =>
      i % 2 ? { role: 'assistant', content: `answer ${i}` } : { role: 'user', content: `question ${i}` });
    history.push({ role: 'user', content: 'Is coffee OK in pregnancy?' });
    const r = req('');
    (r.body as { messages: unknown[] }).messages = history;
    await handler(r, mockRes() as unknown as VercelResponse);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages.length).toBeLessThanOrEqual(40);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[body.messages.length - 1].content).toBe('Is coffee OK in pregnancy?');
  });
});
