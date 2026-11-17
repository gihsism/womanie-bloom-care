import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthSecret: vi.fn(() => new TextEncoder().encode('secret-secret-secret-secret-secret')) }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('jose', () => ({
  jwtVerify: vi.fn().mockResolvedValue({ payload: { sub: 'user_1', sid: 'sess_abc123' } }),
}));

import handler from './logout';
import * as jose from 'jose';

function mockRes() {
  const headers: Record<string, string> = {};
  const body = {
    _headers: headers,
    _redirectTo: null as string | null,
    _redirectStatus: null as number | null,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    }),
    redirect: vi.fn((code: number, url: string) => {
      body._redirectTo = url;
      body._redirectStatus = code;
    }),
  };
  return body as typeof body & VercelResponse;
}

function mockReq(cookie = ''): VercelRequest {
  return {
    method: 'GET',
    headers: { cookie },
  } as unknown as VercelRequest;
}

describe('auth/logout security invariants', () => {
  beforeEach(() => {
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: { sub: 'user_1', sid: 'sess_abc123' },
    } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);
    query.mockReset();
    query.mockResolvedValue([]);
  });

  // Core revocation invariant: a valid session cookie must trigger a
  // DELETE FROM auth_sessions so the token cannot be replayed after logout.
  // The 2026-10-25 session-revocation hardening added this DELETE; without
  // it, getAuthUser's session-existence check would still pass for stolen
  // or long-lived tokens the user has explicitly logged out of.
  it('deletes the session row from auth_sessions when a valid cookie is present', async () => {
    const res = mockRes();
    await handler(mockReq('womanie_session=valid.jwt.token'), res);
    const deleteCall = query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && /DELETE FROM auth_sessions/i.test(c[0])
    );
    expect(deleteCall).toBeDefined();
  });

  // The session id passed to the DELETE must come from the verified JWT
  // payload (payload.sid), not from any client-supplied value. If a
  // refactor replaced payload.sid with a request parameter, an attacker
  // could target and revoke arbitrary sessions they don't own.
  it('binds payload.sid as the session id in the DELETE query, not a client-supplied value', async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: { sub: 'user_1', sid: 'sess_target999' },
    } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);
    const res = mockRes();
    await handler(mockReq('womanie_session=valid.jwt.token'), res);
    const deleteCall = query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && /DELETE FROM auth_sessions/i.test(c[0])
    ) as [string, string[]] | undefined;
    expect(deleteCall).toBeDefined();
    expect(deleteCall![1]).toContain('sess_target999');
  });

  // The Set-Cookie header must carry Max-Age=0 to tell the browser to
  // expire and discard the cookie immediately. Without this, the browser
  // keeps sending the now-invalid cookie on subsequent requests, causing
  // confusing "still logged in" UX even though the server session is gone.
  it('clears the cookie with Max-Age=0', async () => {
    const res = mockRes();
    await handler(mockReq('womanie_session=valid.jwt.token'), res);
    const cookie = res._headers['set-cookie'] ?? '';
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  // The clearing Set-Cookie must still carry HttpOnly and Secure so an
  // XSS script on the response page cannot observe or capture the
  // zero-lifetime cookie value.
  it('sets HttpOnly and Secure on the clearing cookie', async () => {
    const res = mockRes();
    await handler(mockReq('womanie_session=valid.jwt.token'), res);
    const cookie = res._headers['set-cookie'] ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
  });

  // A logout request with no session cookie should not throw or return an
  // error — it should still redirect cleanly so the browser ends at /.
  it('redirects to / when no session cookie is present', async () => {
    const res = mockRes();
    await handler(mockReq(''), res);
    expect(res._redirectTo).toBe('/');
  });

  // An invalid or tampered token must not crash the handler; the inner
  // try/catch ensures it still clears the cookie and redirects.
  it('still redirects and clears the cookie when the JWT is invalid', async () => {
    vi.mocked(jose.jwtVerify).mockRejectedValue(new Error('invalid signature'));
    const res = mockRes();
    await handler(mockReq('womanie_session=bad.jwt.token'), res);
    expect(res._redirectTo).toBe('/');
    const cookie = res._headers['set-cookie'] ?? '';
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  // A 302 is required so the browser follows the Location header back to
  // the home page automatically. A 200 would leave the user on a blank response.
  it('redirects with status 302', async () => {
    const res = mockRes();
    await handler(mockReq('womanie_session=valid.jwt.token'), res);
    expect(res._redirectStatus).toBe(302);
  });

  // When there is no cookie there is nothing to revoke; querying the
  // database unnecessarily would add latency and a potential failure path.
  it('does not query the database when no session cookie is present', async () => {
    const res = mockRes();
    await handler(mockReq(''), res);
    expect(query).not.toHaveBeenCalled();
  });
});
