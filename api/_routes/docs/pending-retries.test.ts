import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './pending-retries';
import { getAuthUser } from '../../_lib/auth.js';

const SESSION_USER = { id: 'user_1', email: 'u@test.com', sessionId: 'sess_1' };

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

const req = (method = 'POST') =>
  ({ method, headers: { cookie: 'womanie_session=x' }, body: {} }) as unknown as VercelRequest;

const OLD = new Date(Date.now() - 60 * 60_000).toISOString();
const doc = (id: string) => ({ id, file_name: `${id}.pdf`, mime_type: 'application/pdf', file_path: 'https://blob/secret.pdf' });

/** Route the handler's queries: the candidate scan, then pending_jobs lookups. */
function wire(candidates: unknown[], jobs: Record<string, unknown> = {}) {
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/FROM health_documents/.test(sql)) return candidates;
    if (/^SELECT status, attempts/.test(sql)) return jobs[params[0] as string] ? [jobs[params[0] as string]] : [];
    return [];
  });
}

describe('api/_routes/docs/pending-retries', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://test';
    vi.mocked(getAuthUser).mockResolvedValue(SESSION_USER);
    query.mockReset();
  });

  it('401 without a session, before any query', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('405 for GET', async () => {
    const res = mockRes();
    await handler(req('GET'), res);
    expect(res._status).toBe(405);
  });

  it('scans only the session user\'s documents ($1 = session id)', async () => {
    wire([]);
    const res = mockRes();
    await handler(req(), res);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/WHERE h\.user_id = \$1/);
    expect(params[0]).toBe(SESSION_USER.id);
    expect(res._body).toEqual({ retries: [] });
  });

  it('first retry: records the attempt under her id and hands back no file URL', async () => {
    wire([doc('d1')]);
    const res = mockRes();
    await handler(req(), res);
    const insert = query.mock.calls.find(c => /INSERT INTO pending_jobs/.test(c[0] as string)) as [string, unknown[]];
    expect(insert[1]).toEqual(['d1', SESSION_USER.id]);
    expect(res._body).toEqual({ retries: [{ documentId: 'd1', fileName: 'd1.pdf', mimeType: 'application/pdf' }] });
    expect(JSON.stringify(res._body)).not.toMatch(/blob|file_path/);
  });

  it('stops after 3 attempts: marks the job failed and does not hand it back', async () => {
    wire([doc('d1')], { d1: { status: 'pending', attempts: 3, updated_at: OLD } });
    const res = mockRes();
    await handler(req(), res);
    expect(query.mock.calls.some(c => /SET status = 'failed'/.test(c[0] as string))).toBe(true);
    expect(res._body).toEqual({ retries: [] });
  });

  it('skips a job retried in the last 2 minutes and a job already failed', async () => {
    wire([doc('d1'), doc('d2')], {
      d1: { status: 'pending', attempts: 1, updated_at: new Date().toISOString() },
      d2: { status: 'failed', attempts: 3, updated_at: OLD },
    });
    const res = mockRes();
    await handler(req(), res);
    expect(res._body).toEqual({ retries: [] });
    expect(query.mock.calls.some(c => /attempts = attempts \+ 1/.test(c[0] as string))).toBe(false);
  });

  it('a stale pending job is retried once more and its attempt counted', async () => {
    wire([doc('d1')], { d1: { status: 'pending', attempts: 1, updated_at: OLD } });
    const res = mockRes();
    await handler(req(), res);
    expect(query.mock.calls.some(c => /attempts = attempts \+ 1/.test(c[0] as string))).toBe(true);
    expect((res._body as { retries: unknown[] }).retries).toHaveLength(1);
  });

  it('hands back at most 5 documents per call', async () => {
    wire(Array.from({ length: 8 }, (_, i) => doc(`d${i}`)));
    const res = mockRes();
    await handler(req(), res);
    expect((res._body as { retries: unknown[] }).retries).toHaveLength(5);
  });

  it('a database error returns a generic 500 with no detail', async () => {
    query.mockRejectedValue(new Error('connection refused at 10.0.0.1'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: 'Internal error' });
  });
});
