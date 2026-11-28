import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './db';
import { getAuthUser } from '../_lib/auth.js';
import { checkAccessCodeInsert, isAccessCodeShape } from '../_lib/access-code.js';

const USER = { id: 'patient_1', email: 'p@b.com', sessionId: 'sess_1' };
const HOUR = 60 * 60 * 1000;

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
const req = (b: unknown) => ({ method: 'POST', headers: {}, body: b }) as unknown as VercelRequest;
const goodRow = (over: Record<string, unknown> = {}) => ({
  patient_id: USER.id,
  code: 'ABCD2345',
  expires_at: new Date(Date.now() + 24 * HOUR).toISOString(),
  is_used: false,
  ...over,
});

describe('share code rules (api/_lib/access-code.ts)', () => {
  it('accepts exactly what the app generates', () => {
    expect(checkAccessCodeInsert(goodRow())).toEqual({ ok: true });
    expect(isAccessCodeShape('HJKMNPQR')).toBe(true);
  });

  it.each([
    ['too short', { code: 'ABC' }],
    ['lowercase', { code: 'abcd2345' }],
    ['ambiguous characters', { code: 'ABCD0O1I' }],
    ['not a string', { code: 12345678 }],
    ['already used', { is_used: true }],
    ['never expires', { expires_at: '2099-01-01T00:00:00Z' }],
    ['already expired', { expires_at: new Date(Date.now() - 1000).toISOString() }],
    ['no expiry', { expires_at: undefined }],
  ])('refuses a row that is %s', (_label, over) => {
    expect(checkAccessCodeInsert(goodRow(over)).ok).toBe(false);
  });
});

describe('/api/db patient_access_codes', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    query.mockResolvedValue([]);
  });

  it('inserts a well-formed code after checking no live code has the same value', async () => {
    const res = mockRes();
    await handler(req({ table: 'patient_access_codes', operation: 'insert', insertData: goodRow() }), res);
    expect(res._status).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(/SELECT 1 FROM patient_access_codes WHERE code = \$1/);
    expect(query.mock.calls[1][0]).toMatch(/^INSERT INTO patient_access_codes/);
  });

  it('refuses a guessable code without touching the database', async () => {
    const res = mockRes();
    await handler(req({ table: 'patient_access_codes', operation: 'insert', insertData: goodRow({ code: 'A' }) }), res);
    expect(res._status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a code that never expires', async () => {
    const res = mockRes();
    await handler(req({ table: 'patient_access_codes', operation: 'insert', insertData: goodRow({ expires_at: '2099-01-01T00:00:00Z' }) }), res);
    expect(res._status).toBe(400);
  });

  it('refuses a code that is already live (so redemption matches one patient only)', async () => {
    query.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = mockRes();
    await handler(req({ table: 'patient_access_codes', operation: 'insert', insertData: goodRow() }), res);
    expect(res._status).toBe(409);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses to flip a used code back to unused or extend it (update)', async () => {
    const res = mockRes();
    await handler(req({
      table: 'patient_access_codes', operation: 'update',
      updateData: { is_used: false, expires_at: '2099-01-01T00:00:00Z' }, filters: [['id', 'eq', 'c1']],
    }), res);
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses upsert', async () => {
    const res = mockRes();
    await handler(req({ table: 'patient_access_codes', operation: 'upsert', upsertData: goodRow() }), res);
    expect(res._status).toBe(403);
  });

  it('still lets her list and cancel (delete) her own codes', async () => {
    const res1 = mockRes();
    await handler(req({ table: 'patient_access_codes', operation: 'select', filters: [['is_used', 'eq', false]] }), res1);
    expect(res1._status).toBe(200);
    const res2 = mockRes();
    await handler(req({ table: 'patient_access_codes', operation: 'delete', filters: [['id', 'eq', 'c1']] }), res2);
    expect(res2._status).toBe(200);
    expect(query.mock.calls[1][0]).toMatch(/DELETE FROM patient_access_codes WHERE id = \$1 AND patient_id = \$2/);
  });
});
