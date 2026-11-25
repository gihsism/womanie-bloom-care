import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
const transaction = vi.fn(async () => []);
vi.mock('@neondatabase/serverless', () => ({
  neon: () => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
    sql.query = query;
    sql.transaction = transaction;
    return sql;
  },
}));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './schedule';
import { getAuthUser } from '../../_lib/auth.js';

function mockRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    setHeader: vi.fn(),
    end: vi.fn(),
    status(code: number) { res._status = code; return res; },
    json(data: unknown) { res._body = data; return res; },
  };
  return res;
}

const body = { days: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }] };
const req = { method: 'POST', headers: {}, body } as unknown as VercelRequest;

describe('POST /api/doctors/schedule', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://test';
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'u1', email: 'a@b.c', sessionId: 's' });
    query.mockReset();
    transaction.mockClear();
  });

  it('refuses a patient account (no doctor role) and writes nothing', async () => {
    query.mockResolvedValue([]);
    const res = mockRes();
    await handler(req, res as unknown as VercelResponse);
    expect(res._status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toMatch(/FROM user_roles WHERE user_id = \$1 AND role = 'doctor'/);
    expect(query.mock.calls[0][1]).toEqual(['u1']);
  });

  it('lets an approved doctor replace their schedule', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    const res = mockRes();
    await handler(req, res as unknown as VercelResponse);
    expect(res._status).toBe(200);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
