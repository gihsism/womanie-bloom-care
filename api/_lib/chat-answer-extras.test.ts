// End-to-end check of the answer extras in the AI chat handler: the
// follow-up tail is never streamed or saved, the citation check runs on
// the answer alone, and the meta event carries follow-ups, the records of
// hers the answer used, and the stored reply's id.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MSG_ID = '3f2b8c1e-9a4d-4e6f-8b21-7c5d9e0a1b2c';
const query = vi.fn();
const inserts: unknown[][] = [];
vi.mock('@neondatabase/serverless', () => ({
  neon: () => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      inserts.push(values);
      return { strings, values };
    };
    sql.query = query;
    sql.transaction = vi.fn(async () => [[], [{ id: MSG_ID }]]);
    return sql;
  },
}));
vi.mock('./auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('./sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('./ratelimit.js', () => ({
  checkAndConsume: vi.fn(async () => ({ ok: true, remaining: 100, limit: 150, retryInSec: 0 })),
}));

import handler from '../ai-doctor-chat';
import { getAuthUser } from './auth.js';
import { FOLLOWUPS_CLOSE, FOLLOWUPS_OPEN } from './chat-followups';

const USER = { id: 'user_abc', email: 'a@test.com', sessionId: 's1' };

function sseStream(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'message_start' })}\n\n`));
      for (const text of chunks) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`));
      }
      c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
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

const req = (content: string) => ({
  method: 'POST', headers: {}, query: {},
  body: { messages: [{ role: 'user', content }], model: 'claude-haiku-5-5' },
}) as unknown as VercelRequest;

const events = (written: string[]) => written
  .map((w) => w.replace(/^data: /, '').trim())
  .filter((w) => w && w !== '[DONE]')
  .map((w) => JSON.parse(w));

describe('ai-doctor-chat answer extras', () => {
  let chunks: string[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.DATABASE_URL = 'postgres://test';
    inserts.length = 0;
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    query.mockImplementation(async (sqlText: string) => {
      if (/FROM profiles/.test(sqlText)) return [{ full_name: 'Test', life_stage: 'menstrual-cycle' }];
      if (/FROM (medical|current)_extracted_data/.test(sqlText)) {
        return [
          { id: 'lab-1', data_type: 'lab_result', title: 'Ferritin', value: '9', unit: 'ng/mL', status: 'low', date_recorded: '2026-06-01', document_id: 'doc-9' },
        ];
      }
      return [];
    });
    fetchMock = vi.fn(async () => new Response(sseStream(chunks), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the tail, never streams or saves it, and sends follow-ups + record chips + message id', async () => {
    const answer = 'Your ferritin of 9 ng/mL is low, which can explain tiredness.';
    const full = `${answer}\n\n${FOLLOWUPS_OPEN}\n- What foods raise my ferritin?\n- Should I retest soon?\n${FOLLOWUPS_CLOSE}`;
    // Split so the marker arrives across chunks.
    chunks = [full.slice(0, answer.length + 5), full.slice(answer.length + 5, answer.length + 9), full.slice(answer.length + 9)];
    const res = mockRes();
    await handler(req('Why is my ferritin low?'), res as unknown as VercelResponse);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system).toContain(FOLLOWUPS_OPEN);

    const evs = events(res.written);
    const streamed = evs.map((e) => e.choices?.[0]?.delta?.content ?? '').join('');
    expect(streamed).not.toContain('[[');
    expect(streamed.trim()).toBe(answer);

    const replace = evs.find((e) => typeof e.replace === 'string');
    expect(replace?.replace).toBe(answer);

    const meta = evs.find((e) => e.meta)?.meta;
    expect(meta.followUps).toEqual(['What foods raise my ferritin?', 'Should I retest soon?']);
    expect(meta.records).toEqual([
      { kind: 'lab', id: 'lab-1', label: 'Ferritin', date: '2026-06-01', href: '/dashboard/medical-history?doc=doc-9', count: 1 },
    ]);
    expect(meta.messageId).toBe(MSG_ID);
    // Row ids never reach the model's prompt.
    expect(body.system).not.toContain('lab-1');

    const stored = inserts.find((v) => typeof v[1] === 'string' && (v[1] as string).startsWith('Your ferritin'));
    expect(stored?.[1]).toBe(answer);
    expect(res.written[res.written.length - 1]).toBe('data: [DONE]\n\n');
  });

  it('no tail: the answer is streamed and saved as before, no follow-ups, no replace', async () => {
    chunks = ['Iron-rich foods include lentils.'];
    const res = mockRes();
    await handler(req('What foods have iron?'), res as unknown as VercelResponse);
    const evs = events(res.written);
    expect(evs.some((e) => typeof e.replace === 'string')).toBe(false);
    const meta = evs.find((e) => e.meta)?.meta;
    expect(meta.followUps).toEqual([]);
    // The answer does not talk about her ferritin: no record chip.
    expect(meta.records).toEqual([]);
  });

  it('a cut-off tail: no chips and no marker in the saved text', async () => {
    chunks = [`Your ferritin is low.\n\n${FOLLOWUPS_OPEN}\n- What foo`];
    const res = mockRes();
    await handler(req('Is my ferritin low?'), res as unknown as VercelResponse);
    const evs = events(res.written);
    expect(evs.find((e) => typeof e.replace === 'string')?.replace).toBe('Your ferritin is low.');
    expect(evs.find((e) => e.meta)?.meta.followUps).toEqual([]);
    const stored = inserts.find((v) => typeof v[1] === 'string' && (v[1] as string).startsWith('Your ferritin'));
    expect(stored?.[1]).toBe('Your ferritin is low.');
  });
});
