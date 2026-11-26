import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn() }));

import handler from './doctor-invite';
import { checkAndConsume } from '../../_lib/ratelimit.js';
import { generateInviteToken, hashInviteToken } from '../../_lib/doctor-invite.js';

function mockRes() {
  let status = 200;
  const body: { _status: number; _body: unknown } & Partial<VercelResponse> = {
    _status: 200,
    _body: null,
    setHeader: vi.fn() as VercelResponse['setHeader'],
    end: vi.fn(() => body as unknown as VercelResponse) as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}
const mockReq = (token?: string) =>
  ({ method: 'GET', headers: {}, query: token === undefined ? {} : { token }, socket: {} }) as unknown as VercelRequest;

describe('auth/doctor-invite (public link check)', () => {
  beforeEach(() => {
    vi.mocked(checkAndConsume).mockResolvedValue({ ok: true, remaining: 1, limit: 60, retryInSec: 0 });
    query.mockReset();
  });

  it('returns the invited email for a live link, looked up by hash', async () => {
    const t = generateInviteToken();
    query.mockResolvedValue([{ email: 'dr@x.ch', expires_at: '2026-12-01T00:00:00Z' }]);
    const res = mockRes();
    await handler(mockReq(t), res);
    expect(res._status).toBe(200);
    expect((res._body as { email: string }).email).toBe('dr@x.ch');
    expect(query.mock.calls[0][1]).toEqual([hashInviteToken(t)]);
    expect(String(query.mock.calls[0][0])).toMatch(/used_at IS NULL[\s\S]*revoked_at IS NULL[\s\S]*expires_at > now\(\)/);
  });

  it('answers 410 for a used, expired, revoked or unknown link', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(generateInviteToken()), res);
    expect(res._status).toBe(410);
  });

  it('answers 410 for a malformed token without touching the database', async () => {
    const res = mockRes();
    await handler(mockReq('abc'), res);
    expect(res._status).toBe(410);
    expect(query).not.toHaveBeenCalled();
  });

  it('is rate-limited', async () => {
    vi.mocked(checkAndConsume).mockResolvedValue({ ok: false, remaining: 0, limit: 60, retryInSec: 10 });
    const res = mockRes();
    await handler(mockReq(generateInviteToken()), res);
    expect(res._status).toBe(429);
  });
});
