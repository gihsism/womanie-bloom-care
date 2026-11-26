import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './normalize-titles';
import { getAuthUser } from '../../_lib/auth.js';

const USER = { id: 'patient_1', email: 'patient@test.com', sessionId: 'sess_1' };

// A row whose title is a known alias ('Hb' → 'Hemoglobin') so the UPDATE fires.
const HB_ROW = { id: 'row_1', title: 'Hb', unit: null };
// A row whose title and unit are already normalized — no UPDATE should fire.
const CLEAN_ROW = { id: 'row_2', title: 'Hemoglobin', unit: null };
// A row that needs a unit change only: the MICRO SIGN variant maps to μg/L.
const MICRO_ROW = { id: 'row_3', title: 'Ferritin', unit: 'mcg/L' };

function mockRes() {
  let status = 200;
  const body: { _status: number; _body: unknown } & Partial<VercelResponse> = {
    _status: 200, _body: null,
    setHeader: vi.fn() as VercelResponse['setHeader'],
    end: vi.fn() as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

function mockReq(method = 'POST'): VercelRequest {
  return { method, headers: { cookie: 'womanie_session=fake' }, body: {}, query: {} } as unknown as VercelRequest;
}

describe('me/normalize-titles security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    query.mockResolvedValue([]);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 405 for non-POST methods', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
      const res = mockRes();
      await handler(mockReq(method), res);
      expect(res._status).toBe(405);
    }
    expect(query).not.toHaveBeenCalled();
  });

  // Ownership invariant: the SELECT must bind the session user's id as $1.
  // A refactor substituting a body or query-string value would let any
  // authenticated user scan — and silently mutate — another user's lab values.
  it('SELECT binds session user id as $1 (never a client-supplied value)', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(USER.id);
  });

  // Regression guard: the WHERE clause on the SELECT must reference user_id = $1
  // so the query is correctly scoped to the session user's rows only.
  it('SQL filters medical_extracted_data by user_id = $1', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+user_id\s*=\s*\$1/i);
  });

  // Double-ownership defence: every UPDATE must also bind the session user's id
  // as a WHERE condition. A SELECT-only ownership check is not enough — if the
  // SELECT were replaced or its WHERE dropped, a corrupted document_id from
  // elsewhere could mutate another user's row. The AND user_id = $N guard on
  // each UPDATE makes the write idempotent-safe even without the SELECT fence.
  it('UPDATE binds session user id as a WHERE parameter (double-ownership defence)', async () => {
    // HB_ROW has title 'Hb' which normalizeTestTitle maps to 'Hemoglobin',
    // so the handler issues an UPDATE for this row.
    query.mockResolvedValueOnce([HB_ROW]); // SELECT returns one aliased row
    query.mockResolvedValue([]);           // UPDATE succeeds

    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);

    // At least one UPDATE must have fired.
    expect(query.mock.calls.length).toBeGreaterThan(1);

    // Every UPDATE call must include the session user id in its parameters.
    const updateCalls = query.mock.calls.slice(1) as [string, unknown[]][];
    for (const [, params] of updateCalls) {
      expect(params).toContain(USER.id);
    }
  });

  // No-op guard: rows that are already normalized must not trigger any UPDATEs.
  // This keeps the endpoint idempotent — running it twice never double-counts.
  it('issues no UPDATE when all rows are already normalized', async () => {
    query.mockResolvedValueOnce([CLEAN_ROW]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    // Only the SELECT should have been called.
    expect(query.mock.calls.length).toBe(1);
    const body = res._body as { titlesUpdated: number; unitsUpdated: number };
    expect(body.titlesUpdated).toBe(0);
    expect(body.unitsUpdated).toBe(0);
  });

  it('returns 200 with correct counts after normalization', async () => {
    // HB_ROW: title 'Hb' → 'Hemoglobin' (1 title update)
    // MICRO_ROW: unit 'mcg/L' → 'μg/L' (1 unit update)
    query.mockResolvedValueOnce([HB_ROW, MICRO_ROW]);
    query.mockResolvedValue([]);

    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { scanned: number; titlesUpdated: number; unitsUpdated: number; updated: number };
    expect(body.scanned).toBe(2);
    expect(body.titlesUpdated).toBe(1);
    expect(body.unitsUpdated).toBe(1);
    expect(body.updated).toBe(2); // back-compat field = sum
  });

  it('returns 200 with scanned=0 when no rows exist for the user', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as { scanned: number; titlesUpdated: number; unitsUpdated: number };
    expect(body.scanned).toBe(0);
    expect(body.titlesUpdated).toBe(0);
    expect(body.unitsUpdated).toBe(0);
  });

  it('returns 500 on a database error', async () => {
    query.mockRejectedValue(new Error('DB unavailable'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
  });
});
