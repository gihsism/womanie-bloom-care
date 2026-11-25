import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './export';
import { getAuthUser } from '../../_lib/auth.js';

type Row = Record<string, unknown>;
const USER = { id: 'user_export_1', email: 'export@test.com', sessionId: 'sess_export_1' };

function mockRes() {
  let status = 200;
  const headers: Record<string, string> = {};
  const body: { _status: number; _body: unknown; _headers: Record<string, string> } & Partial<VercelResponse> = {
    _status: 200, _body: null, _headers: headers,
    setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }) as unknown as VercelResponse['setHeader'],
    end: vi.fn() as VercelResponse['end'],
  };
  body.status = (code: number) => { status = code; body._status = code; return body as unknown as VercelResponse; };
  body.json = (data: unknown) => { body._body = data; body._status = status; return body as unknown as VercelResponse; };
  return body as typeof body & VercelResponse;
}

function mockReq(method = 'GET'): VercelRequest {
  return { method, headers: { cookie: 'womanie_session=fake' }, query: {} } as unknown as VercelRequest;
}

describe('me/export security invariants', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(USER);
    query.mockReset();
    // All queries return empty arrays; profile[0] and authUser[0] will be undefined
    // so the handler falls back to null / {} as designed.
    query.mockResolvedValue([]);
  });

  it('returns 401 when the session is invalid', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
  });

  it('returns 405 for non-GET methods', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = mockRes();
      await handler(mockReq(method), res);
      expect(res._status).toBe(405);
    }
  });

  // Privacy invariant: the auth_users SELECT must never include password_hash.
  // Exporting the hash would let an attacker with read access to the export
  // mount an offline brute-force attack against the user's password.
  it('auth_users query never selects password_hash (privacy invariant)', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const authUsersCall = (query.mock.calls as [string, unknown[]][]).find(
      ([sql]) => /auth_users/i.test(sql)
    );
    expect(authUsersCall).toBeTruthy();
    expect(authUsersCall![0]).not.toMatch(/password_hash/i);
  });

  // The Blob URL stays server-side: documents export a same-origin
  // /api/docs/file link instead of health_documents.file_path.
  it('documents export file_url (proxy link), never the raw file_path', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    const docCall = (query.mock.calls as [string, unknown[]][]).find(([sql]) => /FROM health_documents/i.test(sql));
    expect(docCall![0]).not.toMatch(/file_path/);
    expect(docCall![0]).toMatch(/'\/api\/docs\/file\?id=' \|\| id AS file_url/);
  });

  // Ownership invariant: every SQL query in the Promise.all must bind the
  // session user's id as a parameter. A refactor that dropped the user_id
  // filter from any table (e.g. removing WHERE user_id = $1 from profiles)
  // would include other users' rows in the export — a cross-account data leak.
  it('binds session user id in every database query (ownership invariant)', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    expect(query.mock.calls.length).toBeGreaterThan(0);
    for (const [, params] of query.mock.calls as [string, unknown[]][]) {
      expect(params).toContain(USER.id);
    }
  });

  // Content-Disposition must be set so the browser triggers a file-save
  // dialog rather than rendering the JSON inline — the download prompt also
  // dates the export so users can track when each copy was generated.
  it('sets Content-Disposition attachment header for file download', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const disposition = res._headers['Content-Disposition'] ?? '';
    expect(disposition).toMatch(/^attachment;/i);
    expect(disposition).toMatch(/filename=.*womanie-export/i);
  });

  it('returns 200 with expected top-level payload fields', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect(body).toHaveProperty('exported_at');
    expect(body).toHaveProperty('user');
    expect((body.user as Record<string, unknown>).session_user_id).toBe(USER.id);
    expect(Array.isArray(body.documents)).toBe(true);
    expect(Array.isArray(body.period_tracking)).toBe(true);
    expect(Array.isArray(body.chat_messages)).toBe(true);
    expect(Array.isArray(body.appointments)).toBe(true);
    // doctor sections present even for a patient (empty arrays)
    expect(Array.isArray(body.doctor_authored_notes)).toBe(true);
  });

  it('exports chat conversation_id, visit_questions, user_roles and the newsletter row', async () => {
    query.mockImplementation(async (q: string) => {
      if (/FROM chat_messages/.test(q)) return [{ role: 'user', content: 'hi', model: null, conversation_id: 'c-1', created_at: 't' }];
      if (/FROM visit_questions/.test(q)) return [{ id: 'vq1', question: 'Q?' }];
      if (/FROM user_roles/.test(q)) return [{ role: 'patient', created_at: 't' }];
      if (/FROM newsletter_subscribers/.test(q)) return [{ email: 'export@test.com', source: 'footer' }];
      return [];
    });
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const body = res._body as Record<string, unknown>;
    expect((body.chat_messages as Row[])[0].conversation_id).toBe('c-1');
    expect(body.visit_questions).toEqual([{ id: 'vq1', question: 'Q?' }]);
    expect(body.user_roles).toEqual([{ role: 'patient', created_at: 't' }]);
    expect(body.newsletter_subscription).toEqual({ email: 'export@test.com', source: 'footer' });
  });

  it('still exports chats before migration 013 (no conversation_id column)', async () => {
    query.mockImplementation(async (q: string) => {
      if (/conversation_id/.test(q)) throw Object.assign(new Error('column does not exist'), { code: '42703' });
      if (/FROM chat_messages/.test(q)) return [{ role: 'user', content: 'hi' }];
      return [];
    });
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).chat_messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('returns 500 when the database throws', async () => {
    query.mockRejectedValue(new Error('DB unavailable'));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
  });
});
