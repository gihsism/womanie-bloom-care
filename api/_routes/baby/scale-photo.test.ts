import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn(async () => ({ ok: true })) }));
vi.mock('../../_lib/anthropic.js', async (orig) => ({
  ...(await orig<typeof import('../../_lib/anthropic')>()),
  callAnthropicWithRetry: vi.fn(),
}));

import handler from './scale-photo';
import { getAuthUser } from '../../_lib/auth.js';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import { callAnthropicWithRetry, SONNET_MODEL, SONNET_NO_THINKING } from '../../_lib/anthropic.js';
import { parseScaleReply, parseScaleRequest, readScalePhoto, MAX_IMAGE_BASE64 } from '../../_lib/scale-photo';
import { ROUTES } from '../../router';

const USER = { id: 'user_s1', email: 's@test.com', sessionId: 's' };
const IMG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function mockRes() {
  const r: { _status: number; _body: unknown } & Partial<VercelResponse> = { _status: 200, _body: null };
  r.setHeader = vi.fn() as never;
  r.end = vi.fn() as never;
  r.status = (c: number) => { r._status = c; return r as unknown as VercelResponse; };
  r.json = (d: unknown) => { r._body = d; return r as unknown as VercelResponse; };
  return r as typeof r & VercelResponse;
}
const req = (method: string, body?: unknown) => ({ method, headers: {}, body, query: {} }) as unknown as VercelRequest;
const claude = (text: string, extra: Record<string, unknown> = {}) =>
  ({ json: async () => ({ content: [{ type: 'text', text }], ...extra }) }) as unknown as Response;

describe('parseScaleReply', () => {
  it('reads the strict JSON', () => {
    expect(parseScaleReply('{"weight_kg": 4.62, "confidence": 0.93}')).toEqual({ weight_kg: 4.62, confidence: 0.93 });
  });
  it('tolerates fences, prose and a number as text', () => {
    expect(parseScaleReply('```json\n{"weight_kg":"4,2","confidence":0.8}\n```')).toEqual({ weight_kg: 4.2, confidence: 0.8 });
    expect(parseScaleReply('Here: {"weight_kg": 3.9, "confidence": 0.7} done')).toEqual({ weight_kg: 3.9, confidence: 0.7 });
  });
  it('treats null, out-of-range, zero confidence and junk as unreadable', () => {
    const none = { weight_kg: null, confidence: 0 };
    for (const t of ['{"weight_kg": null, "confidence": 0}', '{"weight_kg": 4620, "confidence": 0.9}', '{"weight_kg": 0.2, "confidence": 0.9}',
      '{"weight_kg": 4.6, "confidence": 0}', 'I cannot see a scale', '', '[1,2]', '{"weight_kg": "abc", "confidence": 1}']) {
      expect(parseScaleReply(t)).toEqual(none);
    }
    expect(parseScaleReply(undefined)).toEqual(none);
  });
  it('clamps confidence to 0-1', () => {
    expect(parseScaleReply('{"weight_kg": 5, "confidence": 7}')).toEqual({ weight_kg: 5, confidence: 1 });
  });
});

describe('parseScaleRequest', () => {
  it('accepts a base64 JPEG, with or without a data: prefix', () => {
    expect(parseScaleRequest({ image: IMG, mediaType: 'image/jpeg' })).toMatchObject({ ok: true, image: IMG });
    expect(parseScaleRequest({ image: `data:image/jpeg;base64,${IMG}`, mediaType: 'image/jpeg' })).toMatchObject({ ok: true, image: IMG });
  });
  it('rejects missing photos, other types, junk and oversize', () => {
    expect(parseScaleRequest(null)).toMatchObject({ ok: false, status: 400 });
    expect(parseScaleRequest({ image: IMG, mediaType: 'image/heic' })).toMatchObject({ ok: false, status: 400 });
    expect(parseScaleRequest({ image: 'not base64!', mediaType: 'image/png' })).toMatchObject({ ok: false, status: 400 });
    expect(parseScaleRequest({ image: 'A'.repeat(MAX_IMAGE_BASE64 + 4), mediaType: 'image/png' })).toMatchObject({ ok: false, status: 413 });
  });
});

describe('POST /api/baby/scale-photo', () => {
  const env = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    vi.mocked(callAnthropicWithRetry).mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterEach(() => { process.env.ANTHROPIC_API_KEY = env; });

  it('is routed through api/router.ts', () => {
    expect(ROUTES['baby/scale-photo']).toBe(handler);
  });

  it('requires POST and a session', async () => {
    const r1 = mockRes(); await handler(req('GET'), r1); expect(r1._status).toBe(405);
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const r2 = mockRes(); await handler(req('POST', { image: IMG, mediaType: 'image/png' }), r2);
    expect(r2._status).toBe(401);
    expect(callAnthropicWithRetry).not.toHaveBeenCalled();
  });

  it('sends the photo with the document-analysis model setup and returns only the number', async () => {
    vi.mocked(callAnthropicWithRetry).mockResolvedValue(claude('{"weight_kg": 4.62, "confidence": 0.9}'));
    const res = mockRes();
    await handler(req('POST', { image: IMG, mediaType: 'image/png' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ weight_kg: 4.62, confidence: 0.9 });
    const [key, body] = vi.mocked(callAnthropicWithRetry).mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe('test-key');
    expect(body.model).toBe(SONNET_MODEL);
    expect(body.thinking).toEqual(SONNET_NO_THINKING);
    expect((body.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    const content = (body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMG } });
  });

  it('an unreadable photo or a refusal is 200 with weight_kg null', async () => {
    vi.mocked(callAnthropicWithRetry).mockResolvedValue(claude('{"weight_kg": null, "confidence": 0}'));
    const r1 = mockRes(); await handler(req('POST', { image: IMG, mediaType: 'image/jpeg' }), r1);
    expect(r1._body).toEqual({ weight_kg: null, confidence: 0 });
    vi.mocked(callAnthropicWithRetry).mockResolvedValue(claude('', { stop_reason: 'refusal' }));
    const r2 = mockRes(); await handler(req('POST', { image: IMG, mediaType: 'image/jpeg' }), r2);
    expect(r2._body).toEqual({ weight_kg: null, confidence: 0 });
  });

  it('validates before calling the model or spending the daily limit', async () => {
    const res = mockRes();
    vi.mocked(checkAndConsume).mockClear();
    await handler(req('POST', { image: IMG, mediaType: 'application/pdf' }), res);
    expect(res._status).toBe(400);
    expect(checkAndConsume).not.toHaveBeenCalled();
    expect(callAnthropicWithRetry).not.toHaveBeenCalled();
  });

  it('daily limit -> 429; model failure -> 502 with a friendly message', async () => {
    vi.mocked(checkAndConsume).mockResolvedValueOnce({ ok: false, limit: 30, remaining: 0, retryInSec: 60 } as never);
    const r1 = mockRes(); await handler(req('POST', { image: IMG, mediaType: 'image/jpeg' }), r1);
    expect(r1._status).toBe(429);
    vi.mocked(callAnthropicWithRetry).mockRejectedValue(new Error('AI request failed: 500'));
    const r2 = mockRes(); await handler(req('POST', { image: IMG, mediaType: 'image/jpeg' }), r2);
    expect(r2._status).toBe(502);
    expect((r2._body as { error: string }).error).toMatch(/Type the weight in/);
  });
});

// What the real model (claude-sonnet-5-5, this prompt) answered for synthetic
// scale photos on 2026-11-28, one live call each. The model is mocked here;
// these pin what the app shows for each answer.
describe('readScalePhoto with the replies the real model gave', () => {
  const none = { weight_kg: null, confidence: 0 };
  const cases: Array<[string, string, { weight_kg: number | null; confidence: number }]> = [
    ['4.62 kg display', '{"weight_kg":4.62,"confidence":0.97}', { weight_kg: 4.62, confidence: 0.97 }],
    ['4620 g display (grams converted by the model)', '{"weight_kg":4.62,"confidence":0.97}', { weight_kg: 4.62, confidence: 0.97 }],
    ['10.2 lb display (10.2 lb = 4.627 kg)', '{"weight_kg":4.63,"confidence":0.97}', { weight_kg: 4.63, confidence: 0.97 }],
    ['3,85 kg display (comma decimal)', '{"weight_kg":3.85,"confidence":0.97}', { weight_kg: 3.85, confidence: 0.97 }],
    ['10 lb 3 oz display', '{"weight_kg":4.621,"confidence":0.97}', { weight_kg: 4.621, confidence: 0.97 }],
    ['3.21 kg with HOLD and a smaller MEM 2.98', '{"weight_kg":3.21,"confidence":0.93}', { weight_kg: 3.21, confidence: 0.93 }],
    ['blurry display', '{"weight_kg":null,"confidence":0}', none],
    // The model reads TARE 0.00 as a confident 0 kg: the 0.5 kg floor turns it into "could not read".
    ['TARE 0.00 display', '{"weight_kg":0.0,"confidence":0.9}', none],
    ['clock showing 12:45', '{"weight_kg":null,"confidence":0}', none],
    ['photo with no scale', '{"weight_kg":null,"confidence":0}', none],
  ];
  for (const [name, reply, want] of cases) {
    it(name, async () => {
      vi.mocked(callAnthropicWithRetry).mockReset().mockResolvedValue(claude(reply));
      expect(await readScalePhoto('k', IMG, 'image/jpeg')).toEqual(want);
    });
  }
  it('a weight returned in grams or pounds by mistake never pre-fills a wrong kg value when out of range', async () => {
    vi.mocked(callAnthropicWithRetry).mockReset().mockResolvedValue(claude('{"weight_kg":4620,"confidence":0.9}'));
    expect(await readScalePhoto('k', IMG, 'image/jpeg')).toEqual(none);
    vi.mocked(callAnthropicWithRetry).mockReset().mockResolvedValue(claude('{"weight_kg":-0.02,"confidence":0.8}'));
    expect(await readScalePhoto('k', IMG, 'image/jpeg')).toEqual(none);
  });
});
