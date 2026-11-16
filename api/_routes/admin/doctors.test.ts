import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query, transaction }) }));
vi.mock('../../_lib/admin.js', () => ({ getAdminUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './doctors';
import { getAdminUser } from '../../_lib/admin.js';

const ADMIN_USER = { id: 'admin_1', email: 'admin@womanie.com', name: 'Admin' };
const PENDING_ROW = { user_id: 'doc_1', email: 'dr@test.com', full_name: 'Dr. Test', verification_status: 'pending' };
const APPROVED_ROW = { user_id: 'doc_2', email: 'dr2@test.com', full_name: 'Dr. Test2', verification_status: 'approved' };

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

function mockReq(method: string, body?: unknown): VercelRequest {
  return {
    method,
    headers: { cookie: 'womanie_session=tok' },
    body: body ?? {},
  } as unknown as VercelRequest;
}

describe('admin/doctors security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAdminUser).mockResolvedValue(ADMIN_USER as never);
    query.mockReset();
    query.mockResolvedValue([PENDING_ROW, APPROVED_ROW]);
    transaction.mockReset();
    transaction.mockResolvedValue([]);
  });

  // The admin check is the first and only gate on this endpoint. A regression that
  // bypasses getAdminUser would let any authenticated user approve, reject, or revoke
  // doctor accounts — granting or stripping privileged roles without oversight.
  it('returns 403 when the caller is not an admin (GET)', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res._status).toBe(403);
  });

  it('returns 403 when the caller is not an admin (POST)', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq('POST', { userId: 'doc_1', action: 'approve' }), res);
    expect(res._status).toBe(403);
  });

  it('returns 405 for unsupported HTTP methods', async () => {
    const res = mockRes();
    await handler(mockReq('PUT', {}), res);
    expect(res._status).toBe(405);
  });

  it('GET returns separate pending and approved doctor lists', async () => {
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(Array.isArray(body.pending)).toBe(true);
    expect(Array.isArray(body.approved)).toBe(true);
    expect((body.pending as typeof PENDING_ROW[])[0].verification_status).toBe('pending');
    expect((body.approved as typeof APPROVED_ROW[])[0].verification_status).toBe('approved');
  });

  it('POST returns 400 when userId is missing', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { action: 'approve' }), res);
    expect(res._status).toBe(400);
  });

  it('POST returns 400 when action is not approve / reject / revoke', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { userId: 'doc_1', action: 'delete' }), res);
    expect(res._status).toBe(400);
  });

  // Approve must set is_verified=true AND insert the doctor role in a single atomic
  // transaction. If only is_verified is set, the doctor appears verified in the
  // directory but cannot use doctor-only endpoints (redeem access codes, read patient
  // charts). If only the role is granted, those endpoints work but the directory hides
  // the doctor. Both must commit together.
  it('approve calls sql.transaction with exactly 2 queries', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { userId: 'doc_1', action: 'approve' }), res);
    expect(res._status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
    const [txArgs] = transaction.mock.calls[0] as [unknown[]];
    expect(txArgs).toHaveLength(2);
  });

  // Regression guard: confirms both SQL operations are present. A refactor that
  // dropped the user_roles INSERT would silently leave approved doctors unable to use
  // doctor-only endpoints because user_roles is what auth and redeem-code gates check.
  it('approve transaction SQL contains UPDATE doctor_profiles (is_verified=true) and INSERT INTO user_roles', async () => {
    await handler(mockReq('POST', { userId: 'doc_1', action: 'approve' }), mockRes());
    const sqls = query.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some(s => /UPDATE doctor_profiles/i.test(s) && /is_verified\s*=\s*true/i.test(s))).toBe(true);
    expect(sqls.some(s => /INSERT INTO user_roles/i.test(s))).toBe(true);
  });

  // Revoke must strip the doctor role alongside de-verification in one atomic
  // transaction. If the DELETE FROM user_roles is dropped, a revoked doctor retains
  // their role and can still redeem patient access codes and read patient charts.
  it('revoke calls sql.transaction and SQL contains UPDATE (is_verified=false) and DELETE FROM user_roles', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { userId: 'doc_1', action: 'revoke' }), res);
    expect(res._status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
    const sqls = query.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sqls.some(s => /UPDATE doctor_profiles/i.test(s) && /is_verified\s*=\s*false/i.test(s))).toBe(true);
    expect(sqls.some(s => /DELETE FROM user_roles/i.test(s))).toBe(true);
  });

  // Reject must also run atomically so that a partial failure doesn't leave the
  // doctor profile in an inconsistent state (e.g. verification_status='rejected' but
  // a stale doctor role still in user_roles if one was mistakenly granted earlier).
  it('reject calls sql.transaction (atomicity invariant)', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { userId: 'doc_1', action: 'reject' }), res);
    expect(res._status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('returns 200 with success: true on successful approve', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { userId: 'doc_1', action: 'approve' }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });
});
