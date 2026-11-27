import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
const sendPush = vi.fn();
vi.mock('../../_lib/push-send.js', async (orig) => ({ ...(await orig<object>()), sendPush: (...a: unknown[]) => sendPush(...a) }));

import config from './config';
import subscription from './subscription';
import sendDue from './send-due';
import test from './test';
import { getAuthUser } from '../../_lib/auth.js';

function mockRes() {
  const r = { _status: 200, _body: null as unknown, setHeader: vi.fn(), end: vi.fn() } as Record<string, unknown>;
  r.status = (c: number) => { r._status = c; return r; };
  r.json = (b: unknown) => { r._body = b; return r; };
  return r as typeof r & VercelResponse & { _status: number; _body: Record<string, unknown> };
}
const req = (o: Partial<VercelRequest>) => ({ method: 'GET', headers: {}, query: {}, ...o }) as VercelRequest;

const VAPID = { VAPID_PUBLIC_KEY: 'BPub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:hello@womanie.info' };
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BKey_-1', auth: 'auth1' } };

beforeEach(() => {
  query.mockReset(); query.mockResolvedValue([]);
  sendPush.mockReset();
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'A' });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('push is off without VAPID keys', () => {
  it('config says disabled and hides any key', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', ''); vi.stubEnv('VAPID_PRIVATE_KEY', ''); vi.stubEnv('VAPID_SUBJECT', '');
    const res = mockRes(); await config(req({}), res);
    expect(res._body).toEqual({ enabled: false });
  });

  it('config gives only the public key when set', async () => {
    for (const [k, v] of Object.entries(VAPID)) vi.stubEnv(k, v);
    const res = mockRes(); await config(req({}), res);
    expect(res._body).toEqual({ enabled: true, publicKey: 'BPub' });
  });

  it('subscribe refuses with 503 and writes nothing', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    const res = mockRes(); await subscription(req({ method: 'POST', body: { subscription: SUB } }), res);
    expect(res._status).toBe(503);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('push/subscription', () => {
  beforeEach(() => { for (const [k, v] of Object.entries(VAPID)) vi.stubEnv(k, v); });

  it('requires a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes(); await subscription(req({ method: 'POST', body: { subscription: SUB } }), res);
    expect(res._status).toBe(401);
  });

  it('saves under the session user, with her timezone and choices', async () => {
    const res = mockRes();
    await subscription(req({ method: 'POST', body: { subscription: SUB, timezone: 'Europe/Zurich', prefs: { period: false }, user_id: 'B' } }), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0];
    expect(params.slice(0, 5)).toEqual(['A', SUB.endpoint, 'BKey_-1', 'auth1', 'Europe/Zurich']);
    expect(JSON.parse(params[5])).toEqual({ medicine: true, period: false, appointment: true, bookings: true, documents: true, ivf_trigger: false, checkups: true });
  });

  it('rejects a non-https endpoint and a bad timezone falls back to UTC', async () => {
    const bad = mockRes();
    await subscription(req({ method: 'POST', body: { subscription: { ...SUB, endpoint: 'http://x' } } }), bad);
    expect(bad._status).toBe(400);
    const ok = mockRes();
    await subscription(req({ method: 'POST', body: { subscription: SUB, timezone: 'Mars/Base' } }), ok);
    expect(query.mock.calls[0][1][4]).toBe('UTC');
  });

  it('delete and read are scoped to the session user', async () => {
    await subscription(req({ method: 'DELETE', body: { endpoint: SUB.endpoint } }), mockRes());
    expect(query.mock.calls[0][0]).toContain('user_id = $2');
    expect(query.mock.calls[0][1]).toEqual([SUB.endpoint, 'A']);
    query.mockResolvedValueOnce([]);
    const res = mockRes();
    await subscription(req({ method: 'GET', query: { endpoint: SUB.endpoint } }), res);
    expect(query.mock.calls[1][1]).toEqual([SUB.endpoint, 'A']);
    expect(res._body).toEqual({ subscribed: false });
  });
});

describe('push/send-due', () => {
  beforeEach(() => { for (const [k, v] of Object.entries(VAPID)) vi.stubEnv(k, v); });

  it('refuses to run without CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = mockRes(); await sendDue(req({ headers: { authorization: 'Bearer ' } }), res);
    expect(res._status).toBe(503);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    vi.stubEnv('CRON_SECRET', 'a-long-enough-secret-123');
    const res = mockRes(); await sendDue(req({ headers: { authorization: 'Bearer nope' } }), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports disabled when VAPID keys are missing', async () => {
    vi.stubEnv('CRON_SECRET', 'a-long-enough-secret-123');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const res = mockRes(); await sendDue(req({ headers: { 'x-cron-secret': 'a-long-enough-secret-123' } }), res);
    expect(res._status).toBe(503);
    expect(res._body.disabled).toBe(true);
  });

  it('runs with the Vercel-cron bearer header', async () => {
    vi.stubEnv('CRON_SECRET', 'a-long-enough-secret-123');
    const res = mockRes(); await sendDue(req({ headers: { authorization: 'Bearer a-long-enough-secret-123' } }), res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ users: 0, sent: 0 });
  });
});

describe('push/test', () => {
  beforeEach(() => { for (const [k, v] of Object.entries(VAPID)) vi.stubEnv(k, v); });

  it('sends only to the session user\'s devices', async () => {
    query.mockResolvedValueOnce([
      { id: 's1', user_id: 'A', endpoint: 'https://p/A', p256dh: 'k', auth: 'a' },
      { id: 's2', user_id: 'B', endpoint: 'https://p/B', p256dh: 'k', auth: 'a' },
    ]);
    sendPush.mockResolvedValue('sent');
    const res = mockRes(); await test(req({ method: 'POST' }), res);
    expect(query.mock.calls[0][1]).toEqual(['A']);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush.mock.calls[0][1].endpoint).toBe('https://p/A');
  });
});
