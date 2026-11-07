import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './respond';
import { getAuthUser } from '../../_lib/auth.js';

const SESSION_USER = { id: 'user_p1', email: 'p@test.com', sessionId: 'sess_1' };
const CONN_ID = 'conn_1';
const AFFECTED_ROW = [{ id: CONN_ID }];

function mockRes() {
  let status = 200;
  const body: { _status: number; _body: unknown } & Partial<VercelResponse> = {
    _status: 200,
    _body: null,
    setHeader: vi.fn() as VercelResponse['setHeader'],
    end: vi.fn() as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

function mockReq(b: unknown): VercelRequest {
  return {
    method: 'POST',
    headers: { cookie: 'womanie_session=fake' },
    body: b,
  } as unknown as VercelRequest;
}

describe('connections/respond security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    query.mockResolvedValue(AFFECTED_ROW);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'approve' }), res);
    expect(res._status).toBe(401);
  });

  it('returns 400 when connectionId is missing', async () => {
    const res = mockRes();
    await handler(mockReq({ action: 'approve' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when action is not approve, reject, or revoke', async () => {
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'delete' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 404 with "Pending" message when approve finds no matching row', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'approve' }), res);
    expect(res._status).toBe(404);
    expect((res._body as Record<string, string>).error).toMatch(/pending/i);
  });

  it('returns 404 with "Pending" message when reject finds no matching row', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'reject' }), res);
    expect(res._status).toBe(404);
    expect((res._body as Record<string, string>).error).toMatch(/pending/i);
  });

  it('returns 404 with "Approved" message when revoke finds no matching row', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'revoke' }), res);
    expect(res._status).toBe(404);
    expect((res._body as Record<string, string>).error).toMatch(/approved/i);
  });

  // Documents the TOCTOU fix: the status check is now inside the WHERE clause of
  // the actual UPDATE/DELETE rather than a separate preliminary SELECT, so a
  // concurrent state change (e.g. admin revoke between our SELECT and UPDATE) is
  // caught atomically and returns 404 instead of silently mutating a connection in
  // the wrong state.
  it('approve UPDATE SQL includes status = pending atomically (TOCTOU guard)', async () => {
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'approve' }), res);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/AND\s+status\s*=\s*'pending'/i);
    expect(sql).toMatch(/RETURNING/i);
  });

  it('reject DELETE SQL includes status param atomically (TOCTOU guard)', async () => {
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'reject' }), res);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/DELETE\s+FROM/i);
    expect(sql).toMatch(/AND\s+status\s*=\s*\$3/i);
    expect(params).toContain('pending');
  });

  it('revoke DELETE SQL includes status param atomically (TOCTOU guard)', async () => {
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'revoke' }), res);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/DELETE\s+FROM/i);
    expect(sql).toMatch(/AND\s+status\s*=\s*\$3/i);
    expect(params).toContain('approved');
  });

  it('returns 200 on successful approve', async () => {
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'approve' }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });

  it('returns 200 on successful reject', async () => {
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'reject' }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });

  it('returns 200 on successful revoke', async () => {
    const res = mockRes();
    await handler(mockReq({ connectionId: CONN_ID, action: 'revoke' }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });
});
