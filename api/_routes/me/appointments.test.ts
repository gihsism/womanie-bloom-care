import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './appointments';
import { getAuthUser } from '../../_lib/auth.js';

function mockRes() {
  const r = { _status: 200, _body: null as unknown, setHeader: vi.fn(), end: vi.fn() } as Record<string, unknown>;
  r.status = (c: number) => { r._status = c; return r; };
  r.json = (b: unknown) => { r._body = b; return r; };
  return r as typeof r & VercelResponse & { _status: number; _body: Record<string, unknown> };
}
const req = (q: Record<string, string> = {}) => ({ method: 'GET', headers: {}, query: q }) as unknown as VercelRequest;

beforeEach(() => {
  query.mockReset(); query.mockResolvedValue([]);
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'p1' } as never);
});

describe('me/appointments', () => {
  it('requires a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  for (const q of [{}, { upcoming: 'true' }] as Array<Record<string, string>>) {
    it(`only reads the session patient's visits and only public doctor fields (${JSON.stringify(q)})`, async () => {
      const res = mockRes();
      await handler(req(q), res);
      expect(res._status).toBe(200);
      const [text, params] = query.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(['p1']);
      expect(text).toMatch(/WHERE a\.patient_id = \$1/);
      // The booking time for the in-app confirmation, the doctor's practice
      // address for in-person visits, and nothing private about her.
      expect(text).toMatch(/'created_at' AS booked_at/);
      expect(text).toMatch(/'practice_address' AS doctor_practice_address/);
      expect(text).not.toMatch(/p\.email|license|p\.phone|verification_status|to_jsonb\(p\)\s*AS/);
    });
  }
});
