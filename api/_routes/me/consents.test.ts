import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './consents';
import { getAuthUser } from '../../_lib/auth.js';
import { POLICY_VERSIONS } from '../../_lib/policy-versions';

const USER = { id: 'user_c1', email: 'c@test.com', sessionId: 's' };

function mockRes() {
  const r: { _status: number; _body: unknown } & Partial<VercelResponse> = { _status: 200, _body: null };
  r.setHeader = vi.fn() as never;
  r.end = vi.fn() as never;
  r.status = (c: number) => { r._status = c; return r as unknown as VercelResponse; };
  r.json = (d: unknown) => { r._body = d; return r as unknown as VercelResponse; };
  return r as typeof r & VercelResponse;
}
const req = (method: string, body?: unknown) =>
  ({ method, headers: {}, body, query: {} }) as unknown as VercelRequest;

describe('me/consents', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
  });

  it('requires a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req('GET'), res);
    expect(res._status).toBe(401);
  });

  it('records the CURRENT server version, ignoring any version in the body', async () => {
    query.mockResolvedValue([{ document: 'privacy_policy', version: POLICY_VERSIONS.privacy_policy!.version }]);
    const res = mockRes();
    await handler(req('POST', { document: 'privacy_policy', version: '1999-01-01' }), res);
    expect(res._status).toBe(200);
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    expect(text).toMatch(/INSERT INTO consent_log/);
    expect(params).toEqual([USER.id, 'privacy_policy', POLICY_VERSIONS.privacy_policy!.version]);
  });

  it('rejects unknown and unpublished documents', async () => {
    for (const document of ['cookies', 'terms', undefined]) {
      const res = mockRes();
      await handler(req('POST', { document }), res);
      expect(res._status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('lists only her own history, and says "not available" before migration 024', async () => {
    query.mockResolvedValueOnce([{ document: 'privacy_policy', version: 'v', accepted_at: 't' }]);
    let res = mockRes();
    await handler(req('GET'), res);
    expect((query.mock.calls[0] as [string, unknown[]])[1]).toEqual([USER.id]);
    expect(res._body).toMatchObject({ available: true, history: [{ version: 'v' }] });

    query.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    res = mockRes();
    await handler(req('GET'), res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ available: false, history: [] });
  });
});
