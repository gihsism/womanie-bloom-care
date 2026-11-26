import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query, transaction }) }));
vi.mock('../../_lib/admin.js', async (orig) => ({
  ...(await orig<typeof import('../../_lib/admin.js')>()),
  getAdminUser: vi.fn(),
}));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './invites';
import { getAdminUser } from '../../_lib/admin.js';
import { hashInviteToken } from '../../_lib/doctor-invite.js';

const ADMIN = { id: 'admin_1', email: 'founder@womanie.info' };

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
const mockReq = (method: string, body?: unknown) =>
  ({ method, headers: {}, body: body ?? {} }) as unknown as VercelRequest;

const sqlOf = (re: RegExp) => query.mock.calls.find((c: unknown[]) => re.test(String(c[0])));

describe('admin/invites', () => {
  beforeEach(() => {
    vi.mocked(getAdminUser).mockResolvedValue(ADMIN as never);
    query.mockReset();
    query.mockResolvedValue([]);
    transaction.mockReset();
    transaction.mockResolvedValue([]);
  });

  it.each(['GET', 'POST'])('%s is admin only', async (method) => {
    vi.mocked(getAdminUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(method, { email: 'dr@praxis.ch' }), res);
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates a 7-day link, stores only the token hash, and logs it in the same transaction', async () => {
    const before = Date.now();
    const res = mockRes();
    await handler(mockReq('POST', { email: ' Dr.Muster@Praxis.CH ', note: 'Met at congress' }), res);
    expect(res._status).toBe(200);
    const body = res._body as { link: string; email: string; expiresAt: string };
    expect(body.email).toBe('dr.muster@praxis.ch');
    const token = new URL(body.link).searchParams.get('invite')!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ttl = new Date(body.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(7 * 24 * 3600e3 - 5000);
    expect(ttl).toBeLessThanOrEqual(7 * 24 * 3600e3 + 5000);

    expect(transaction).toHaveBeenCalledOnce();
    const ins = sqlOf(/INSERT INTO doctor_invites/)!;
    const params = ins[1] as unknown[];
    expect(params).toContain(hashInviteToken(token));
    expect(params).not.toContain(token); // raw token never stored
    expect(params).toContain('admin_1');

    const log = sqlOf(/INSERT INTO admin_audit_log/)!;
    expect((log[1] as unknown[]).slice(0, 3)).toEqual(['admin_1', 'founder@womanie.info', 'invite_create']);
    expect((log[1] as unknown[])[4]).toBe('dr.muster@praxis.ch');
    // and an earlier open link for the same doctor stops working
    expect(sqlOf(/UPDATE doctor_invites SET revoked_at/)).toBeTruthy();
  });

  it('two invites never share a token', async () => {
    const a = mockRes(); const b = mockRes();
    await handler(mockReq('POST', { email: 'a@x.ch' }), a);
    await handler(mockReq('POST', { email: 'a@x.ch' }), b);
    expect((a._body as { link: string }).link).not.toBe((b._body as { link: string }).link);
  });

  it('refuses an invalid email', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { email: 'nope' }), res);
    expect(res._status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses an email that already has an account', async () => {
    query.mockResolvedValueOnce([{ id: 'user_x' }]);
    const res = mockRes();
    await handler(mockReq('POST', { email: 'taken@x.ch' }), res);
    expect(res._status).toBe(409);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('revokes an open invite and logs it', async () => {
    query.mockResolvedValueOnce([{ id: 'inv_1', email: 'dr@x.ch' }]);
    const res = mockRes();
    await handler(mockReq('POST', { action: 'revoke', id: 'inv_1' }), res);
    expect(res._status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
    const log = sqlOf(/INSERT INTO admin_audit_log/)!;
    expect((log[1] as unknown[])[2]).toBe('invite_revoke');
  });

  it('GET lists invites with a status and never a token', async () => {
    const future = new Date(Date.now() + 86400e3).toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    query.mockResolvedValueOnce([
      { id: '1', email: 'a@x', expires_at: future },
      { id: '2', email: 'b@x', expires_at: past },
      { id: '3', email: 'c@x', expires_at: future, used_at: past },
      { id: '4', email: 'd@x', expires_at: future, revoked_at: past },
    ]);
    const res = mockRes();
    await handler(mockReq('GET'), res);
    const inv = (res._body as { invites: Array<{ status: string }> }).invites;
    expect(inv.map(i => i.status)).toEqual(['open', 'expired', 'used', 'revoked']);
    expect(String(query.mock.calls[0][0])).not.toMatch(/token/);
  });
});
