import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query, transaction }) }));
vi.mock('../../_lib/admin.js', () => ({ getAdminUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './docs';
import { getAdminUser } from '../../_lib/admin.js';

const ADMIN_USER = { id: 'admin_1', email: 'admin@womanie.com', name: 'Admin' };

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

describe('admin/docs security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAdminUser).mockResolvedValue(ADMIN_USER as never);
    query.mockReset();
    transaction.mockReset();
    // Default: no existing auth_users row for the supplied oldUserId (orphaned data).
    query.mockResolvedValue([]);
    // Default: three-table transaction returns empty moved-row arrays.
    transaction.mockResolvedValue([[], [], []]);
  });

  // The admin check is the first and only gate on this endpoint. A regression that
  // bypasses getAdminUser would let any authenticated user enumerate all users'
  // id + email + document counts (GET) or move any user's medical records (POST).
  it('returns 403 when the caller is not an admin (GET)', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res._status).toBe(403);
  });

  it('returns 403 when the caller is not an admin (POST)', async () => {
    vi.mocked(getAdminUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq('POST', { oldUserId: 'some_user' }), res);
    expect(res._status).toBe(403);
  });

  it('returns 405 for unsupported HTTP methods', async () => {
    const res = mockRes();
    await handler(mockReq('DELETE'), res);
    expect(res._status).toBe(405);
  });

  // GET lists every user's document groupings for the admin dashboard.
  it('GET returns current_user, total_groups, and a groups array', async () => {
    // Three sequential queries: docGroups, dataGroups, knownUsers.
    query.mockResolvedValueOnce([{ user_id: 'old_1', doc_count: 3, first_upload: null, last_upload: null }]);
    query.mockResolvedValueOnce([{ user_id: 'old_1', data_count: 10 }]);
    query.mockResolvedValueOnce([]); // knownUsers — no matching auth_users row
    const res = mockRes();
    await handler(mockReq('GET'), res);
    expect(res._status).toBe(200);
    const b = res._body as Record<string, unknown>;
    expect(b.current_user).toMatchObject({ id: ADMIN_USER.id });
    expect(typeof b.total_groups).toBe('number');
    expect(Array.isArray(b.groups)).toBe(true);
  });

  it('POST returns 400 when oldUserId is missing', async () => {
    const res = mockRes();
    await handler(mockReq('POST', {}), res);
    expect(res._status).toBe(400);
  });

  // Self-claim guard: prevents an admin from accidentally claiming their own rows,
  // which would be a no-op but could confuse the response counts.
  it('POST returns 400 when oldUserId equals the admin\'s own id', async () => {
    const res = mockRes();
    await handler(mockReq('POST', { oldUserId: ADMIN_USER.id }), res);
    expect(res._status).toBe(400);
  });

  // Cross-account protection: if oldUserId belongs to an existing auth_users row with a
  // different email, the claim must be refused. Without this check, an admin could move
  // any active user's entire medical record history onto their own account by supplying
  // that user's id — a direct data-theft path for anyone with admin credentials.
  it('POST returns 403 when oldUserId belongs to a different email account', async () => {
    query.mockResolvedValueOnce([{ id: 'other_user', email: 'someone-else@example.com' }]);
    const res = mockRes();
    await handler(mockReq('POST', { oldUserId: 'other_user' }), res);
    expect(res._status).toBe(403);
  });

  // Atomicity invariant: all three tables (health_documents, medical_extracted_data,
  // document_analyses) must move in a single sql.transaction(). Sequential sql.query()
  // calls would not be atomic — if the second or third UPDATE failed, health_documents
  // would already be under the new user while the other two tables remained under the
  // old id. A second claim attempt would find no health_documents to move and return
  // zero rows, permanently orphaning the extracted data and analyses with no recovery path.
  it('POST calls sql.transaction with exactly 3 queries', async () => {
    query.mockResolvedValueOnce([]); // orphaned id — no matching auth_users row
    const res = mockRes();
    await handler(mockReq('POST', { oldUserId: 'orphan_id' }), res);
    expect(res._status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
    const [txArgs] = transaction.mock.calls[0] as [unknown[]];
    expect(txArgs).toHaveLength(3);
  });

  // Response completeness: the payload must report moved-row counts for all three
  // tables so the admin can confirm the full migration succeeded (not just the docs).
  it('POST response reports claimed counts for all three tables', async () => {
    query.mockResolvedValueOnce([]); // orphaned id
    transaction.mockResolvedValueOnce([
      [{ id: 'doc1' }],
      [{ id: 'med1' }, { id: 'med2' }],
      [{ id: 'ana1' }],
    ]);
    const res = mockRes();
    await handler(mockReq('POST', { oldUserId: 'orphan_id' }), res);
    expect(res._status).toBe(200);
    const b = res._body as Record<string, unknown>;
    expect(b.success).toBe(true);
    expect(b.claimed_documents).toBe(1);
    expect(b.claimed_extracted_data).toBe(2);
    expect(b.claimed_analyses).toBe(1);
  });
});
