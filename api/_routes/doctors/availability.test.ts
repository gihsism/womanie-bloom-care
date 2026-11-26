import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './availability';
import { getAuthUser } from '../../_lib/auth.js';

function mockRes() {
  const r = { _status: 200, _body: null as unknown, setHeader: vi.fn(), end: vi.fn() } as Record<string, unknown>;
  r.status = (c: number) => { r._status = c; return r; };
  r.json = (b: unknown) => { r._body = b; return r; };
  return r as typeof r & VercelResponse & { _status: number; _body: Record<string, unknown> };
}
const req = (q: Record<string, string>) => ({ method: 'GET', headers: {}, query: q }) as unknown as VercelRequest;

beforeEach(() => {
  query.mockReset(); query.mockResolvedValue([]);
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'p1' } as never);
});

describe('doctors/availability', () => {
  it('requires a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req({ doctor_id: 'd1', date: '2099-01-06' }), res);
    expect(res._status).toBe(401);
  });

  it('rejects an impossible date', async () => {
    const res = mockRes();
    await handler(req({ doctor_id: 'd1', date: '2099-13-01' }), res);
    expect(res._status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('cuts the day at Zurich midnight and returns only times, never patient identity', async () => {
    const res = mockRes();
    await handler(req({ doctor_id: 'd1', date: '2099-01-06' }), res);
    expect(res._status).toBe(200);
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['d1', '2099-01-05T23:00:00.000Z', '2099-01-06T23:00:00.000Z']);
    expect(text).toMatch(/SELECT scheduled_at, duration\s+FROM appointments/);
    expect(text).not.toMatch(/patient_id|notes/);
    expect(text).toMatch(/<> 'cancelled'/);
  });
});
