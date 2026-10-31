import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './db';
import { getAuthUser } from '../_lib/auth.js';

const SESSION_USER = { id: 'user_abc', email: 'a@b.com', sessionId: 'sess_1' };

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

describe('api/_routes/db security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    query.mockResolvedValue([]);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq({ table: 'profiles', operation: 'select' }), res);
    expect(res._status).toBe(401);
  });

  it('returns 403 for a table not in the OWNER_COLUMN whitelist', async () => {
    const res = mockRes();
    await handler(mockReq({ table: 'auth_users', operation: 'select' }), res);
    expect(res._status).toBe(403);
  });

  it('returns 403 when trying to insert into user_roles (WRITE_BLOCKED)', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'user_roles', operation: 'insert', insertData: { user_id: SESSION_USER.id, role: 'doctor' } }),
      res,
    );
    expect(res._status).toBe(403);
    expect((res._body as Record<string, string>).error).toMatch(/read-only/i);
  });

  it('returns 403 when trying to insert into doctor_profiles (INSERT_BLOCKED)', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_profiles', operation: 'insert', insertData: { user_id: SESSION_USER.id, full_name: 'Dr. Evil' } }),
      res,
    );
    expect(res._status).toBe(403);
  });

  it('returns 403 when trying to set is_verified on doctor_profiles (PROTECTED_COLUMNS)', async () => {
    const res = mockRes();
    await handler(
      mockReq({
        table: 'doctor_profiles',
        operation: 'update',
        updateData: { is_verified: true, full_name: 'Good Doctor' },
        filters: [['user_id', 'eq', SESSION_USER.id]],
      }),
      res,
    );
    expect(res._status).toBe(403);
    expect((res._body as Record<string, string>).error).toMatch(/not writable/i);
  });

  it('returns 403 when the client filters by another user\'s id (owner mismatch)', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'profiles', operation: 'select', filters: [['id', 'eq', 'other_user_xyz']] }),
      res,
    );
    expect(res._status).toBe(403);
    expect((res._body as Record<string, string>).error).toMatch(/owner mismatch/i);
  });

  it('auto-injects the session user\'s owner filter when none is supplied', async () => {
    query.mockResolvedValue([{ id: SESSION_USER.id, full_name: 'Alice' }]);
    const res = mockRes();
    await handler(mockReq({ table: 'profiles', operation: 'select' }), res);
    expect(res._status).toBe(200);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE/i);
    expect(params).toContain(SESSION_USER.id);
  });

  it('upsert SQL includes a WHERE owner guard so it cannot overwrite another user\'s row', async () => {
    query.mockResolvedValue([{ id: SESSION_USER.id, full_name: 'Alice' }]);
    const res = mockRes();
    await handler(
      mockReq({
        table: 'profiles',
        operation: 'upsert',
        upsertData: { id: SESSION_USER.id, full_name: 'Alice Updated' },
        upsertOptions: { onConflict: 'id' },
      }),
      res,
    );
    expect(res._status).toBe(200);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    // The ON CONFLICT … DO UPDATE SET … WHERE profiles.id = $N clause
    // must be present and the final param must be the session user's id.
    expect(sql).toMatch(/DO UPDATE SET/i);
    expect(sql).toMatch(/WHERE profiles\.id\s*=/i);
    expect(params[params.length - 1]).toBe(SESSION_USER.id);
  });
});
