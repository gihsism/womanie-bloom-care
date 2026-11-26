import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// neon() returns a tagged-template-literal function that also carries .query and
// .transaction as methods. tagFn covers the template-literal calls (the per-table
// DELETEs inside sql.transaction([])), query covers the preliminary email SELECT,
// and transaction covers the atomic batch commit.
const query = vi.fn();
const transaction = vi.fn();
const tagFn = vi.fn();
vi.mock('@neondatabase/serverless', () => ({
  neon: () => Object.assign(tagFn, { query, transaction }),
}));
vi.mock('@vercel/blob', () => ({ del: vi.fn(), list: vi.fn() }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './delete-account';
import { getAuthUser } from '../../_lib/auth.js';
import { list, del } from '@vercel/blob';
import { readFileSync, readdirSync } from 'node:fs';
import { hashSubject } from '../../_lib/ratelimit.js';

const SESSION_USER = { id: 'user_1', email: 'user@test.com', sessionId: 'sess_1' };
const CONFIRM_PHRASE = 'DELETE MY ACCOUNT';

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

function mockReq(b: unknown, method = 'POST'): VercelRequest {
  return {
    method,
    headers: { cookie: 'womanie_session=fake' },
    body: b,
  } as unknown as VercelRequest;
}

describe('me/delete-account security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    // The preliminary SELECT resolves the email for newsletter unsubscription.
    query.mockResolvedValue([{ email: 'user@test.com' }]);
    transaction.mockReset();
    transaction.mockResolvedValue([]);
    tagFn.mockReset();
    // Each sql`DELETE ...` call returns a resolved promise that is collected into
    // the array passed to sql.transaction([...]).
    tagFn.mockReturnValue(Promise.resolve([]));
    vi.mocked(list).mockResolvedValue({ blobs: [], cursor: '', hasMore: false, url: '' } as never);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }, 'GET'), res);
    expect(res._status).toBe(405);
  });

  it('returns 400 when the confirm field is missing', async () => {
    const res = mockRes();
    await handler(mockReq({}), res);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, string>).error).toMatch(/confirm/i);
  });

  it('returns 400 when the confirm phrase is wrong (case-sensitive)', async () => {
    const res = mockRes();
    await handler(mockReq({ confirm: 'delete my account' }), res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when the confirm phrase is a partial match', async () => {
    const res = mockRes();
    await handler(mockReq({ confirm: 'DELETE' }), res);
    expect(res._status).toBe(400);
  });

  // Documents that every table deletion runs inside a single sql.transaction([...]).
  // Sequential sql.query() calls would not be atomic: a failed step partway through
  // would leave a partial erasure, violating GDPR right to erasure.
  it('runs all table deletions inside a single atomic transaction', async () => {
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(transaction).toHaveBeenCalledOnce();
    const [txArgs] = transaction.mock.calls[0] as [unknown[]];
    expect(Array.isArray(txArgs)).toBe(true);
    // 25 base DELETEs + 1 newsletter (email present in mock) = 26
    expect(txArgs.length).toBeGreaterThanOrEqual(25);
  });

  // user_app_data (migration 011) is erased with everything else once it
  // exists, and its absence (migration not yet applied) can't break deletion.
  it('erases user_app_data only when the table exists', async () => {
    const sqlText = () => tagFn.mock.calls.map(c => (c[0] as string[]).join('?')).join('\n');
    query.mockImplementation(async (q: string) =>
      /to_regclass/.test(q) ? [{ present: true }] : [{ email: 'user@test.com' }]);
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), mockRes());
    expect(sqlText()).toMatch(/DELETE FROM user_app_data WHERE user_id/);

    tagFn.mockClear();
    query.mockImplementation(async (q: string) =>
      /to_regclass/.test(q) ? [{ present: false }] : [{ email: 'user@test.com' }]);
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(sqlText()).not.toMatch(/user_app_data/);
    expect(res._status).toBe(200);
  });

  // Regression guard: the email SELECT must run BEFORE the transaction so
  // newsletter_subscribers can be unsubscribed — the transaction deletes auth_users
  // last, which is the row that holds the email address.
  it('resolves the canonical email via SELECT before the transaction (newsletter guard)', async () => {
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(query).toHaveBeenCalled();
    const [firstSql] = query.mock.calls[0] as [string, unknown[]];
    expect(firstSql).toMatch(/SELECT.*email.*FROM.*auth_users/i);
    // transaction must still be called once after the SELECT
    expect(transaction).toHaveBeenCalledOnce();
  });

  // Confirms the session cookie is cleared on success. Without Max-Age=0 the browser
  // would continue sending the now-invalid session token on every subsequent request.
  it('clears the session cookie (HttpOnly, Max-Age=0) on successful deletion', async () => {
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(res._status).toBe(200);
    const setCookieCalls = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const setCookieCall = setCookieCalls.find(([name]) => name === 'Set-Cookie');
    expect(setCookieCall).toBeTruthy();
    expect(setCookieCall?.[1]).toMatch(/Max-Age=0/i);
    expect(setCookieCall?.[1]).toMatch(/HttpOnly/i);
  });

  it('returns 200 with success: true on successful deletion', async () => {
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).success).toBe(true);
  });
  it('deletes every page of the user\'s blobs, not just the first 1000', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'tok';
    vi.mocked(del).mockClear();
    vi.mocked(list)
      .mockResolvedValueOnce({ blobs: [{ url: 'u1' }], cursor: 'c2', hasMore: true } as never)
      .mockResolvedValueOnce({ blobs: [{ url: 'u2' }], cursor: '', hasMore: false } as never);
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(res._status).toBe(200);
    expect(vi.mocked(list).mock.calls[1][0]).toMatchObject({ prefix: `${SESSION_USER.id}/`, cursor: 'c2' });
    expect(vi.mocked(del).mock.calls.map(c => c[0])).toEqual([['u1'], ['u2']]);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  // Coverage guard: every table the app keeps per user - the /api/db
  // whitelist (OWNER_COLUMN) plus every table created by db/migrations and
  // the server-only auth/chat tables - must be erased. A new user-scoped
  // table that is not added to delete-account fails here.
  it('erases every user-scoped table (whitelist + migrations)', async () => {
    const root = new URL('../../../', import.meta.url);
    const dbSrc = readFileSync(new URL('api/_routes/db.ts', root), 'utf8');
    const ownerBlock = dbSrc.slice(dbSrc.indexOf('const OWNER_COLUMN'), dbSrc.indexOf('};', dbSrc.indexOf('const OWNER_COLUMN')));
    const whitelist = [...ownerBlock.matchAll(/^\s+([a-z_]+):/gm)].map(m => m[1]);
    const migDir = new URL('db/migrations/', root);
    const migrated = readdirSync(migDir).flatMap(f =>
      [...readFileSync(new URL(f, migDir), 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/gi)].map(m => m[1]));
    const NOT_USER_ROWS = new Set([
      'current_extracted_data', // a VIEW over medical_extracted_data (migration 002)
    ]);
    const expected = new Set(
      [...whitelist, ...migrated, 'chat_messages', 'auth_sessions', 'auth_users', 'llm_cache']
        .filter(t => !NOT_USER_ROWS.has(t)),
    );
    expect(whitelist.length).toBeGreaterThan(15);

    query.mockImplementation(async (q: string) =>
      /to_regclass/.test(q)
        ? [{ present: true, visit_questions: true, pending_jobs: true, rate_limit_counters: true, push_subscriptions: true, birth_plans: true, ivf_plans: true }]
        : [{ email: 'User@Test.com' }]);
    const res = mockRes();
    await handler(mockReq({ confirm: CONFIRM_PHRASE }), res);
    expect(res._status).toBe(200);
    const deleted = new Set(
      tagFn.mock.calls.flatMap(c => [...(c[0] as string[]).join('?').matchAll(/DELETE FROM ([a-z_]+)/g)].map(m => m[1])),
    );
    const missing = [...expected].filter(t => !deleted.has(t));
    expect(missing).toEqual([]);

    // Rate-limit rows are matched by the hashed id and hashed lower-case email.
    const rl = tagFn.mock.calls.find(c => /DELETE FROM rate_limit_counters/.test((c[0] as string[]).join('?')));
    expect(rl?.[1]).toEqual([hashSubject(SESSION_USER.id), hashSubject('user@test.com')]);
  });
});
