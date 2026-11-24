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

  it('update ignores a client updated_at (the server sets it once; two would fail in Postgres)', async () => {
    query.mockResolvedValue([{ id: 'm1' }]);
    const res = mockRes();
    await handler(
      mockReq({
        table: 'medications',
        operation: 'update',
        updateData: { active: false, updated_at: '2026-11-24T17:00:00.000Z' },
        filters: [['id', 'eq', 'm1'], ['user_id', 'eq', SESSION_USER.id]],
      }),
      res,
    );
    expect(res._status).toBe(200);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql.match(/updated_at/g)).toHaveLength(1);
    expect(sql).toMatch(/SET active = \$1, updated_at = now\(\)/);
    expect(params).not.toContain('2026-11-24T17:00:00.000Z');
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
  it('rejects a client-supplied __owner_or__ filter (SQL injection through its column list)', async () => {
    const res = mockRes();
    await handler(
      mockReq({
        table: 'health_documents',
        operation: 'select',
        filters: [['__owner_or__', 'in', { cols: ['true) OR (true'], value: 'x' }]],
      }),
      res,
    );
    expect(res._status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('blocks every write to doctor_patient_connections (a self-approved connection would open any chart)', async () => {
    for (const body of [
      { operation: 'insert', insertData: { doctor_id: SESSION_USER.id, patient_id: 'victim', status: 'approved' } },
      { operation: 'upsert', upsertData: { doctor_id: SESSION_USER.id, patient_id: 'victim', status: 'approved' } },
      { operation: 'update', updateData: { status: 'approved' }, filters: [['doctor_id', 'eq', SESSION_USER.id]] },
      { operation: 'delete', filters: [['doctor_id', 'eq', SESSION_USER.id]] },
    ]) {
      const res = mockRes();
      await handler(mockReq({ table: 'doctor_patient_connections', ...body }), res);
      expect(res._status).toBe(403);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('still lets a doctor read their own doctor_patient_connections rows', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_patient_connections', operation: 'select', filters: [['doctor_id', 'eq', SESSION_USER.id]] }),
      res,
    );
    expect(res._status).toBe(200);
  });

  it('blocks inserting appointments directly (booking goes through /api/appointments/book)', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'appointments', operation: 'insert', insertData: { patient_id: SESSION_USER.id, doctor_id: 'd1', scheduled_at: '2026-12-01T10:00:00Z' } }),
      res,
    );
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('appointments updates may change status/notes only', async () => {
    query.mockImplementation(async (text: string) =>
      /FROM appointments WHERE id = \$1/.test(text)
        ? [{ patient_id: SESSION_USER.id, doctor_id: 'd1', status: 'scheduled', scheduled_at: '2099-01-01T10:00:00Z', duration: 30, notes: null }]
        : []);
    const ok = mockRes();
    await handler(
      mockReq({ table: 'appointments', operation: 'update', updateData: { status: 'cancelled', notes: 'x' }, filters: [['id', 'eq', 'a1']] }),
      ok,
    );
    expect(ok._status).toBe(200);
    const bad = mockRes();
    await handler(
      mockReq({ table: 'appointments', operation: 'update', updateData: { scheduled_at: '2026-12-01T10:00:00Z' }, filters: [['id', 'eq', 'a1']] }),
      bad,
    );
    expect(bad._status).toBe(403);
  });

  it('a patient cannot mark her appointment completed, and the UPDATE never runs', async () => {
    query.mockImplementation(async (text: string) =>
      /FROM appointments WHERE id = \$1/.test(text)
        ? [{ patient_id: SESSION_USER.id, doctor_id: 'd1', status: 'scheduled', scheduled_at: '2099-01-01T10:00:00Z', duration: 30, notes: null }]
        : []);
    const res = mockRes();
    await handler(
      mockReq({ table: 'appointments', operation: 'update', updateData: { status: 'completed' }, filters: [['id', 'eq', 'a1']] }),
      res,
    );
    expect(res._status).toBe(403);
    expect(query.mock.calls.some(c => /^UPDATE appointments/.test(c[0] as string))).toBe(false);
  });

  it('a patient account cannot write consultation_settings or doctor_schedule', async () => {
    for (const body of [
      { table: 'consultation_settings', operation: 'upsert', upsertData: { doctor_id: SESSION_USER.id, consultation_price: 1 } },
      { table: 'consultation_settings', operation: 'update', updateData: { consultation_price: 1 } },
      { table: 'doctor_schedule', operation: 'insert', insertData: { day_of_week: 1, start_time: '09:00', end_time: '17:00' } },
      { table: 'doctor_schedule', operation: 'delete' },
    ]) {
      query.mockReset();
      query.mockResolvedValue([]); // no doctor role
      const res = mockRes();
      await handler(mockReq(body), res);
      expect(res._status).toBe(403);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toMatch(/FROM user_roles/);
    }
  });

  it('a doctor can save consultation settings; anyone can still read them', async () => {
    query.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([{ doctor_id: SESSION_USER.id }]);
    const ok = mockRes();
    await handler(
      mockReq({ table: 'consultation_settings', operation: 'upsert', upsertData: { doctor_id: SESSION_USER.id, consultation_price: 90 }, upsertOptions: { onConflict: 'doctor_id' } }),
      ok,
    );
    expect(ok._status).toBe(200);
    expect(query.mock.calls[1][0]).toMatch(/^INSERT INTO consultation_settings/);

    query.mockReset();
    query.mockResolvedValue([]);
    const read = mockRes();
    await handler(mockReq({ table: 'consultation_settings', operation: 'select' }), read);
    expect(read._status).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(/^SELECT/);
  });

  it('appointments cannot be deleted through /api/db', async () => {
    const res = mockRes();
    await handler(mockReq({ table: 'appointments', operation: 'delete', filters: [['id', 'eq', 'a1']] }), res);
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('doctor_notes insert needs an approved connection to the patient', async () => {
    query.mockResolvedValueOnce([]); // connection lookup: none
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'insert', insertData: { doctor_id: SESSION_USER.id, patient_id: 'victim', title: 't', content: 'c' } }),
      res,
    );
    expect(res._status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([SESSION_USER.id, 'victim']);

    query.mockReset();
    query.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([{ id: 'n1' }]);
    const ok = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'insert', insertData: { doctor_id: SESSION_USER.id, patient_id: 'p1', title: 't', content: 'c' } }),
      ok,
    );
    expect(ok._status).toBe(200);
    expect(query.mock.calls[1][0]).toMatch(/^INSERT INTO doctor_notes/);
  });

  it('doctor_notes cannot be re-pointed at another patient', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'update', updateData: { patient_id: 'victim' }, filters: [['id', 'eq', 'n1']] }),
      res,
    );
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('api/_routes/db error responses', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
  });

  it('never returns raw Postgres error text, and logs no values', async () => {
    const pgErr = Object.assign(
      new Error('duplicate key value violates unique constraint "x" Key (email)=(secret@example.com)'),
      { code: '23505', constraint: 'profiles_email_key', detail: 'Key (email)=(secret@example.com) already exists.' },
    );
    query.mockRejectedValue(pgErr);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await handler(
      mockReq({ table: 'profiles', operation: 'update', updateData: { full_name: 'Jane Doe' } }),
      res,
    );
    expect(res._status).toBe(409);
    expect(JSON.stringify(res._body)).not.toMatch(/secret|duplicate|constraint|Key/);
    const logged = log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toContain('23505');
    expect(logged).toContain('profiles');
    expect(logged).not.toMatch(/secret@|Jane/);
    log.mockRestore();
  });

  it('maps an unknown failure to a generic 500', async () => {
    query.mockRejectedValue(new Error('connection to 10.0.0.5 refused, password=hunter2'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await handler(mockReq({ table: 'profiles', operation: 'select' }), res);
    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: 'Database error' });
    expect(log.mock.calls.map(c => c.join(' ')).join('\n')).not.toContain('hunter2');
    log.mockRestore();
  });

  it('maps a bad value (e.g. malformed uuid) to a generic 400', async () => {
    query.mockRejectedValue(Object.assign(new Error('invalid input syntax for type uuid: "abc"'), { code: '22P02' }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await handler(mockReq({ table: 'profiles', operation: 'select' }), res);
    expect(res._status).toBe(400);
    expect(JSON.stringify(res._body)).not.toContain('abc');
    log.mockRestore();
  });
});
