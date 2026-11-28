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
import { parseScaleReply, parseScaleRequest, readScalePhoto, toKg, MAX_IMAGE_BASE64, SCALE_SCHEMA } from '../../_lib/scale-photo';
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
  it('reads the strict JSON (number + unit on the display)', () => {
    expect(parseScaleReply('{"value": 4.62, "unit": "kg", "confidence": 0.93}')).toEqual({ weight_kg: 4.62, confidence: 0.93 });
  });
  it('converts grams and pounds in our code and says what the display showed', () => {
    expect(parseScaleReply('{"value": 4620, "unit": "g", "confidence": 0.9}')).toEqual({ weight_kg: 4.62, confidence: 0.9, shown: '4620 g' });
    expect(parseScaleReply('{"value": 10.2, "unit": "lb", "confidence": 0.9}')).toEqual({ weight_kg: 4.63, confidence: 0.9, shown: '10.2 lb' });
    expect(parseScaleReply('{"value": 10, "unit": "lb_oz", "ounces": 3, "confidence": 0.9}')).toEqual({ weight_kg: 4.62, confidence: 0.9, shown: '10 lb 3 oz' });
    // "lb" with ounces is pounds and ounces; "lb_oz" without ounces is whole pounds
    expect(parseScaleReply('{"value": 7, "unit": "lb", "ounces": 8, "confidence": 0.9}')).toEqual({ weight_kg: 3.4, confidence: 0.9, shown: '7 lb 8 oz' });
    expect(parseScaleReply('{"value": 8, "unit": "lb_oz", "confidence": 0.9}')).toEqual({ weight_kg: 3.63, confidence: 0.9, shown: '8 lb 0 oz' });
  });
  it('tolerates fences, prose and a number as text', () => {
    expect(parseScaleReply('```json\n{"value":"4,2","unit":"kg","confidence":0.8}\n```')).toEqual({ weight_kg: 4.2, confidence: 0.8 });
    expect(parseScaleReply('Here: {"value": 3.9, "unit": "kg", "confidence": 0.7} done')).toEqual({ weight_kg: 3.9, confidence: 0.7 });
  });
  it('treats no unit, null, out-of-range after conversion, bad ounces, zero confidence and junk as unreadable', () => {
    const none = { weight_kg: null, confidence: 0 };
    for (const t of [
      '{"value": null, "unit": null, "confidence": 0}',
      '{"value": 4.62, "unit": null, "confidence": 0.9}',          // number without a unit: no guessing
      '{"value": 4.62, "unit": "stone", "confidence": 0.9}',
      '{"value": 4620, "unit": "kg", "confidence": 0.9}',          // grams labelled kg -> over 25 kg
      '{"value": 4.62, "unit": "g", "confidence": 0.9}',           // kg labelled g -> under 0.5 kg
      '{"value": 0.2, "unit": "kg", "confidence": 0.9}',
      '{"value": 60, "unit": "lb", "confidence": 0.9}',
      '{"value": -1, "unit": "kg", "confidence": 0.9}',
      '{"value": 10, "unit": "lb_oz", "ounces": 16, "confidence": 0.9}',
      '{"value": 4.6, "unit": "kg", "confidence": 0}',
      '{"weight_kg": 4.6, "confidence": 0.9}',                     // the old shape has no unit
      'I cannot see a scale', '', '[1,2]', '{"value": "abc", "unit": "kg", "confidence": 1}']) {
      expect(parseScaleReply(t)).toEqual(none);
    }
    expect(parseScaleReply(undefined)).toEqual(none);
  });
  it('clamps confidence to 0-1', () => {
    expect(parseScaleReply('{"value": 5, "unit": "kg", "confidence": 7}')).toEqual({ weight_kg: 5, confidence: 1 });
  });
  it('the 0.5-25 kg floor and ceiling apply to the converted weight', () => {
    expect(parseScaleReply('{"value": 500, "unit": "g", "confidence": 0.9}')).toMatchObject({ weight_kg: 0.5 });
    expect(parseScaleReply('{"value": 499, "unit": "g", "confidence": 0.9}')).toEqual({ weight_kg: null, confidence: 0 });
    expect(parseScaleReply('{"value": 55, "unit": "lb", "confidence": 0.9}')).toMatchObject({ weight_kg: 24.95 });
    expect(parseScaleReply('{"value": 56, "unit": "lb", "confidence": 0.9}')).toEqual({ weight_kg: null, confidence: 0 });
  });
});

describe('toKg', () => {
  it('kg and g keep gram precision, pounds round to 10 g', () => {
    expect(toKg(3.8549, 'kg')).toBe(3.855);
    expect(toKg(4620, 'g')).toBe(4.62);
    expect(toKg(3215.4, 'g')).toBe(3.215);
    expect(toKg(10.2, 'lb')).toBe(4.63);   // 4.6266 kg
    expect(toKg(10, 'lb_oz', 3)).toBe(4.62); // 4.6211 kg
    expect(toKg(1, 'lb')).toBe(0.45);
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
    vi.mocked(callAnthropicWithRetry).mockResolvedValue(claude('{"value": 4.62, "unit": "kg", "confidence": 0.9}'));
    const res = mockRes();
    await handler(req('POST', { image: IMG, mediaType: 'image/png' }), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ weight_kg: 4.62, confidence: 0.9 });
    const [key, body] = vi.mocked(callAnthropicWithRetry).mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe('test-key');
    expect(body.model).toBe(SONNET_MODEL);
    expect(body.thinking).toEqual(SONNET_NO_THINKING);
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema: SCALE_SCHEMA } });
    expect(Object.keys(SCALE_SCHEMA.properties)).toEqual(['value', 'unit', 'ounces', 'confidence']);
    const content = (body.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMG } });
  });

  it('an unreadable photo or a refusal is 200 with weight_kg null', async () => {
    vi.mocked(callAnthropicWithRetry).mockResolvedValue(claude('{"value": null, "unit": null, "confidence": 0}'));
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

// What the real model (claude-sonnet-5-5, this prompt and schema) answered
// for the synthetic scale photos on 2026-11-28, one live call each, after the
// unit guard (the model reads number + unit, our code converts). The model is
// mocked here; these pin what the app gets for each answer.
describe('readScalePhoto with the replies the real model gave', () => {
  const none = { weight_kg: null, confidence: 0 };
  const cases: Array<[string, string, { weight_kg: number | null; confidence: number; shown?: string }]> = [
    ['4.62 kg display', '{"value":4.62,"unit":"kg","confidence":0.97}', { weight_kg: 4.62, confidence: 0.97 }],
    ['4620 g display (converted here)', '{"value":4620,"unit":"g","confidence":0.97}', { weight_kg: 4.62, confidence: 0.97, shown: '4620 g' }],
    ['10.2 lb display (10.2 lb = 4.627 kg)', '{"value":10.2,"unit":"lb","confidence":0.97}', { weight_kg: 4.63, confidence: 0.97, shown: '10.2 lb' }],
    ['3,85 kg display (comma decimal)', '{"value":3.85,"unit":"kg","confidence":0.97}', { weight_kg: 3.85, confidence: 0.97 }],
    ['blurry display', '{"value":null,"unit":null,"confidence":0}', none],
    // The model reads TARE 0.00 as a confident 0 kg: the 0.5 kg floor turns it into "could not read".
    ['TARE 0.00 display', '{"value":0,"unit":"kg","confidence":0.95}', none],
    ['clock showing 12:45', '{"value":null,"unit":null,"confidence":0}', none],
    ['photo with no scale', '{"value":null,"unit":null,"confidence":0}', none],
    ['10 lb 3 oz display (= 4.621 kg)', '{"value":10,"unit":"lb_oz","ounces":3,"confidence":0.97}', { weight_kg: 4.62, confidence: 0.97, shown: '10 lb 3 oz' }],
    ['3.21 kg with HOLD and a smaller MEM 2.98', '{"value":3.21,"unit":"kg","confidence":0.95}', { weight_kg: 3.21, confidence: 0.95 }],
  ];
  for (const [name, reply, want] of cases) {
    it(name, async () => {
      vi.mocked(callAnthropicWithRetry).mockReset().mockResolvedValue(claude(reply));
      expect(await readScalePhoto('k', IMG, 'image/jpeg')).toEqual(want);
    });
  }
  it('a wrong unit never pre-fills a wrong kg value when out of range', async () => {
    vi.mocked(callAnthropicWithRetry).mockReset().mockResolvedValue(claude('{"value":4620,"unit":"kg","confidence":0.9}'));
    expect(await readScalePhoto('k', IMG, 'image/jpeg')).toEqual(none);
    vi.mocked(callAnthropicWithRetry).mockReset().mockResolvedValue(claude('{"value":-0.02,"unit":"kg","confidence":0.8}'));
    expect(await readScalePhoto('k', IMG, 'image/jpeg')).toEqual(none);
  });
});
