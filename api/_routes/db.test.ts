import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
const sendPush = vi.fn();
vi.mock('../_lib/push-send.js', async (orig) => ({ ...(await orig<object>()), sendPush: (...a: unknown[]) => sendPush(...a) }));

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

  // Once the patient removes the doctor, the doctor can no longer change a
  // note she can read. The check joins the note to an APPROVED connection
  // for the note's own patient, bound to the session doctor.
  it('doctor_notes update needs an approved connection to the note\'s patient', async () => {
    query.mockResolvedValueOnce([]); // note + approved connection lookup: none
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'update', updateData: { title: 'x', content: 'y' }, filters: [['id', 'eq', 'n1']] }),
      res,
    );
    expect(res._status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
    const [checkSql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(checkSql).toMatch(/JOIN doctor_patient_connections/i);
    expect(checkSql).toMatch(/c\.patient_id\s*=\s*n\.patient_id/i);
    expect(checkSql).toMatch(/status\s*=\s*'approved'/i);
    expect(params).toEqual(['n1', SESSION_USER.id]);

    query.mockReset();
    query.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([{ id: 'n1' }]);
    const ok = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'update', updateData: { title: 'x', content: 'y' }, filters: [['id', 'eq', 'n1']] }),
      ok,
    );
    expect(ok._status).toBe(200);
    expect(query.mock.calls[1][0]).toMatch(/^UPDATE doctor_notes/);
    expect(query.mock.calls[1][0]).toMatch(/doctor_id = \$\d/);
  });

  it('doctor_notes update without a note id is refused before any query', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'update', updateData: { title: 'x' }, filters: [] }),
      res,
    );
    expect(res._status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('a doctor can still delete her own note after the connection ends', async () => {
    query.mockResolvedValueOnce([{ id: 'n1' }]);
    const res = mockRes();
    await handler(mockReq({ table: 'doctor_notes', operation: 'delete', filters: [['id', 'eq', 'n1']] }), res);
    expect(res._status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/^DELETE FROM doctor_notes WHERE id = \$1 AND doctor_id = \$2/);
  });

  it('medications stay owner-only: a doctor cannot read a patient\'s medicines through /api/db', async () => {
    const res = mockRes();
    await handler(mockReq({ table: 'medications', operation: 'select', filters: [['user_id', 'eq', 'patient_1']] }), res);
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('birth_plans stay owner-only: a doctor cannot read a patient\'s plan through /api/db', async () => {
    const res = mockRes();
    await handler(mockReq({ table: 'birth_plans', operation: 'select', filters: [['user_id', 'eq', 'patient_1']] }), res);
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('birth_plans upsert is pinned to the session user', async () => {
    const res = mockRes();
    await handler(mockReq({
      table: 'birth_plans', operation: 'upsert',
      upsertData: { user_id: 'someone_else', plan: '{}' }, upsertOptions: { onConflict: 'user_id' },
    }), res);
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

describe('health_documents.file_path never reaches the client', () => {
  const URL_ = 'https://abc.public.blob.vercel-storage.com/user_abc/scan-R4nd.pdf';
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
  });

  it('is stripped from select *, explicit selects, and insert/update/delete RETURNING rows', async () => {
    for (const body of [
      { operation: 'select' },
      { operation: 'select', selectColumns: 'id, file_name, file_path' },
      { operation: 'insert', insertData: { file_name: 'a.pdf', file_path: URL_ } },
      { operation: 'update', updateData: { ai_suggested_name: 'x' }, filters: [['id', 'eq', 'd1']] },
      { operation: 'delete', filters: [['id', 'eq', 'd1']] },
    ]) {
      query.mockResolvedValueOnce([{ id: 'd1', file_name: 'a.pdf', file_path: URL_ }]);
      const res = mockRes();
      await handler(mockReq({ table: 'health_documents', ...body }), res);
      expect(res._status).toBe(200);
      const rows = (res._body as { rows: Record<string, unknown>[] }).rows;
      expect(rows[0].id).toBe('d1');
      expect(rows[0]).not.toHaveProperty('file_path');
      expect(JSON.stringify(res._body)).not.toContain('blob.vercel-storage.com');
    }
  });

  it('can be set on insert (the upload flow) but never changed by update or upsert', async () => {
    query.mockResolvedValue([]);
    const ins = mockRes();
    await handler(mockReq({ table: 'health_documents', operation: 'insert', insertData: { file_name: 'a.pdf', file_path: URL_ } }), ins);
    expect(ins._status).toBe(200);
    query.mockClear();
    for (const body of [
      { operation: 'update', updateData: { file_path: 'https://abc.public.blob.vercel-storage.com/victim/x.pdf' }, filters: [['id', 'eq', 'd1']] },
      { operation: 'upsert', upsertData: { id: 'd1', file_path: 'https://abc.public.blob.vercel-storage.com/victim/x.pdf' } },
    ]) {
      const res = mockRes();
      await handler(mockReq({ table: 'health_documents', ...body }), res);
      expect(res._status).toBe(403);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('leaves other tables untouched', async () => {
    query.mockResolvedValueOnce([{ id: 'p1', file_path: 'kept' }]);
    const res = mockRes();
    await handler(mockReq({ table: 'medications', operation: 'select' }), res);
    expect((res._body as { rows: Record<string, unknown>[] }).rows[0].file_path).toBe('kept');
  });
});

describe('api/_routes/db: table allow-list', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    query.mockResolvedValue([]);
  });

  // OWNER_COLUMN is a plain object: 'constructor', 'toString', '__proto__'
  // resolve through Object.prototype and used to pass the allow-list,
  // reaching SQL with a function's source text as the "owner column".
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('rejects inherited key %s as a table', async (table) => {
    const res = mockRes();
    await handler(mockReq({ table, operation: 'select' }), res);
    expect(res._status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('api/_routes/db: doctor_notes by a revoked doctor', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
    // Approved connection row still exists, but the 'doctor' role is gone.
    query.mockImplementation(async (sql: string) => {
      if (/doctor_patient_connections/.test(sql)) return /user_roles/.test(sql) ? [] : [{ '?column?': 1 }];
      if (/^(INSERT|UPDATE)/.test(sql)) return [{ id: 'n1' }];
      return [];
    });
  });

  it('cannot insert a note for a patient', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'insert', insertData: { patient_id: 'p1', title: 't', content: 'c' } }),
      res,
    );
    expect(res._status).toBe(403);
  });

  it('cannot edit a note the patient can read', async () => {
    const res = mockRes();
    await handler(
      mockReq({ table: 'doctor_notes', operation: 'update', updateData: { content: 'changed' }, filters: [['id', 'eq', 'n1']] }),
      res,
    );
    expect(res._status).toBe(403);
  });
});

describe('api/_routes/db: doctor booking alerts on a patient cancel', () => {
  const VAPID = { VAPID_PUBLIC_KEY: 'BPub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:hello@womanie.info' };
  const APT = { id: 'a1', patient_id: SESSION_USER.id, doctor_id: 'd1', scheduled_at: '2099-01-06T09:00:00Z', duration: 30, notes: null };
  const subs = [
    { id: 's1', user_id: 'd1', endpoint: 'https://p/d1', p256dh: 'k', auth: 'a', prefs: { bookings: true } },
    { id: 's2', user_id: 'other', endpoint: 'https://p/x', p256dh: 'k', auth: 'a', prefs: {} },
  ];
  function wire(caller: 'patient' | 'doctor', newStatus: string) {
    vi.mocked(getAuthUser).mockResolvedValue(caller === 'patient' ? SESSION_USER : { ...SESSION_USER, id: 'd1' });
    query.mockReset();
    query.mockImplementation(async (text: string) => {
      if (/FROM appointments WHERE id = \$1/.test(text)) return [{ ...APT, status: 'scheduled' }];
      if (/^UPDATE appointments/.test(text)) return [{ ...APT, status: newStatus }];
      if (/FROM push_subscriptions/.test(text)) return subs;
      return [];
    });
  }
  beforeEach(() => {
    for (const [k, v] of Object.entries(VAPID)) vi.stubEnv(k, v);
    sendPush.mockReset(); sendPush.mockResolvedValue('sent');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('a patient cancel alerts only the visit\'s doctor, without the patient\'s name', async () => {
    wire('patient', 'cancelled');
    const res = mockRes();
    await handler(mockReq({ table: 'appointments', operation: 'update', updateData: { status: 'cancelled' }, filters: [['id', 'eq', 'a1']] }), res);
    expect(res._status).toBe(200);
    const subQ = query.mock.calls.find(c => /FROM push_subscriptions/.test(c[0] as string))!;
    expect(subQ[1]).toEqual(['d1']);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sendPush.mock.calls[0][1].endpoint).toBe('https://p/d1');
    expect(sendPush.mock.calls[0][2].body).toBe('A patient cancelled the visit on Tue 6 Jan, 10:00');
  });

  it('the doctor\'s own cancel is not echoed back to her', async () => {
    wire('doctor', 'cancelled');
    const res = mockRes();
    await handler(mockReq({ table: 'appointments', operation: 'update', updateData: { status: 'cancelled', notes: 'Cancelled by doctor: ill' }, filters: [['id', 'eq', 'a1']] }), res);
    expect(res._status).toBe(200);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('nothing is sent and no subscription is read while push is off', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    wire('patient', 'cancelled');
    const res = mockRes();
    await handler(mockReq({ table: 'appointments', operation: 'update', updateData: { status: 'cancelled' }, filters: [['id', 'eq', 'a1']] }), res);
    expect(res._status).toBe(200);
    expect(query.mock.calls.some(c => /push_subscriptions/.test(c[0] as string))).toBe(false);
  });
});
