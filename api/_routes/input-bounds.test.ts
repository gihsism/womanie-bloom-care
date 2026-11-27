import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Reliability round 3: bad input is a 400 (not a 500), every list query is
// bounded, and error responses never carry internal messages.

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../_lib/auth.js', () => ({ getAuthUser: vi.fn(), getAuthSecret: vi.fn() }));
vi.mock('../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('../_lib/ratelimit.js', () => ({ checkAndConsume: vi.fn().mockResolvedValue({ ok: true, retryInSec: 0 }) }));

import db, { selectLimit, SELECT_HARD_CAP, SELECT_EXPLICIT_MAX } from './db';
import predictOvulation from './predict-ovulation';
import login from './auth/login';
import signup from './auth/signup';
import doctorPatient from './doctors/patient';
import doctorsList from './doctors/list';
import { uploadClientError } from '../upload';
import { getAuthUser } from '../_lib/auth.js';

const USER = { id: 'user_abc', email: 'a@b.com', sessionId: 'sess_1' };

function mockRes() {
  const r = { _status: 200, _body: null as unknown } as { _status: number; _body: unknown } & Partial<VercelResponse>;
  r.setHeader = vi.fn() as VercelResponse['setHeader'];
  r.end = vi.fn() as VercelResponse['end'];
  r.status = (c: number) => { r._status = c; return r as unknown as VercelResponse; };
  r.json = (d: unknown) => { r._body = d; return r as unknown as VercelResponse; };
  return r as typeof r & VercelResponse;
}
const req = (body: unknown, extra: Partial<VercelRequest> = {}) =>
  ({ method: 'POST', headers: {}, query: {}, body, socket: {}, ...extra }) as unknown as VercelRequest;

beforeEach(() => {
  vi.mocked(getAuthUser).mockResolvedValue(USER);
  query.mockReset();
  query.mockResolvedValue([]);
});

describe('/api/db input and bounds', () => {
  it('every read is bounded: no .limit() gets the hard cap, an explicit one is capped', async () => {
    expect(selectLimit(undefined)).toBe(SELECT_HARD_CAP);
    expect(selectLimit(null)).toBe(SELECT_HARD_CAP);
    expect(selectLimit('abc')).toBe(SELECT_HARD_CAP);
    expect(selectLimit(-3)).toBe(SELECT_HARD_CAP);
    expect(selectLimit(10)).toBe(10);
    expect(selectLimit(10_000_000)).toBe(SELECT_EXPLICIT_MAX);

    const res = mockRes();
    await db(req({ table: 'daily_health_signals', operation: 'select' }), res);
    expect(res._status).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(new RegExp(`LIMIT ${SELECT_HARD_CAP}$`));
  });

  it('a .limit() on a write is ignored instead of producing invalid SQL', async () => {
    const res = mockRes();
    await db(req({ table: 'daily_health_signals', operation: 'delete', filters: [['id', 'eq', 'x']], limitCount: 1 }), res);
    expect(res._status).toBe(200);
    expect(query.mock.calls[0][0]).not.toMatch(/LIMIT/);
  });

  it('rejects an unknown filter operator, a non-array "in", too many filters and a bad operation', async () => {
    for (const body of [
      { table: 'medications', operation: 'select', filters: [['id', 'like', '%']] },
      { table: 'medications', operation: 'select', filters: [['id', 'in', 'x']] },
      { table: 'medications', operation: 'select', filters: Array.from({ length: 21 }, () => ['id', 'eq', 'x']) },
      { table: 'medications', operation: 'drop' },
      { table: 'medications', operation: { select: 1 } },
      { table: ['medications'], operation: 'select' },
    ]) {
      const res = mockRes();
      await db(req(body), res);
      expect(res._status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('a database failure answers with a generic message, never the Postgres text', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation "secret_table" does not exist at character 15'), { code: 'XX000' }));
    const res = mockRes();
    await db(req({ table: 'medications', operation: 'select' }), res);
    expect(res._status).toBe(500);
    expect(JSON.stringify(res._body)).not.toMatch(/secret_table|relation|character/);
  });
});

describe('predict-ovulation input', () => {
  it('a lastPeriodStart that is not a date is a 400, not a crash', async () => {
    for (const lastPeriodStart of ['garbage', '2026-13-45', 12345, { a: 1 }]) {
      const res = mockRes();
      await predictOvulation(req({ cycleData: { cycleLength: 28, lastPeriodStart } }), res);
      expect(res._status).toBe(400);
    }
  });
  it('still predicts from a valid date with a huge signal list', async () => {
    const res = mockRes();
    const healthData = Array.from({ length: 5000 }, (_, i) => ({ date: '2026-01-01', symptoms: [], notes: String(i) }));
    await predictOvulation(req({ cycleData: { cycleLength: 28, lastPeriodStart: '2026-11-01' }, healthData }), res);
    expect(res._status).toBe(200);
    expect((res._body as { prediction: { predictedOvulationDate: string } }).prediction.predictedOvulationDate).toBe('2026-11-15');
  });
});

describe('auth input', () => {
  it('login: non-string email/password or no body is a 400, never a 500', async () => {
    for (const body of [undefined, null, { email: 42, password: 'x' }, { email: 'a@b.co', password: { $gt: '' } }, { email: 'a@b.co', password: 'x'.repeat(500) }]) {
      const res = mockRes();
      await login(req(body), res);
      expect(res._status, JSON.stringify(body)).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
  it('signup: a malformed email or an object as name is a 400', async () => {
    for (const body of [{ email: 'nope', password: 'longenough1' }, { email: 'a@b.co', password: 'longenough1', name: { x: 1 } }, { email: ['a@b.co'], password: 'longenough1' }]) {
      const res = mockRes();
      await signup(req(body), res);
      expect(res._status, JSON.stringify(body)).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
});

describe('list queries are bounded', () => {
  it("the doctor's patient chart caps every list it reads", async () => {
    query.mockImplementation(async (sql: string) => (/doctor_patient_connections/.test(sql) ? [{ id: 'c1' }] : []));
    const res = mockRes();
    await doctorPatient(req(undefined, { method: 'GET', query: { id: 'patient_1' } }), res);
    expect(res._status).toBe(200);
    const reads = query.mock.calls.map(c => c[0] as string)
      .filter(s => /^\s*SELECT/.test(s) && !/WHERE id = \$1$/.test(s.trim()));
    expect(reads.length).toBeGreaterThan(4);
    for (const s of reads) expect(s, s.slice(0, 60)).toMatch(/LIMIT \d+/);
  });
  it('the doctor directory caps its reads', async () => {
    const res = mockRes();
    await doctorsList(req(undefined, { method: 'GET' }), res);
    for (const c of query.mock.calls) expect(c[0]).toMatch(/LIMIT \d+/);
  });
});

describe('upload error text', () => {
  it('only our own Forbidden refusals pass through', () => {
    expect(uploadClientError(new Error('Forbidden: pathname must be scoped to session user'))).toMatch(/^Forbidden/);
    expect(uploadClientError(new Error('connect ECONNREFUSED 10.0.0.1:5432'))).toBe('Upload failed');
    expect(uploadClientError(new SyntaxError('Unexpected token < in JSON at position 0'))).toBe('Upload failed');
    expect(uploadClientError('weird')).toBe('Upload failed');
  });
});
