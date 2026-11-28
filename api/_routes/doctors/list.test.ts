import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './list';
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

const req = (method = 'GET', overrides: Partial<VercelRequest> = {}) =>
  ({ method, headers: { cookie: 'womanie_session=x' }, body: {}, query: {}, ...overrides }) as unknown as VercelRequest;

// A minimal doctor_profiles row (approved, verified) with private fields
// that must never reach the response.
const DOC_ROW = {
  user_id: 'doc_1',
  full_name: 'Dr. Alice Smith',
  title: 'MD',
  specialties: ['OB-GYN'],
  years_experience: 10,
  bio: 'Expert in women\'s health',
  avatar_url: 'https://cdn.example.com/avatar.jpg',
  rating: '4.9',
  review_count: '42',
  is_verified: true,
  languages: ['English'],
  credentials: ['MBBS'],
  practice_address: null,
  // private columns that must NOT appear in the response
  email: 'alice@clinic.com',
  phone: '+41791234567',
  licence_number: 'CH-MED-123',
};

const SETTINGS_ROW = {
  doctor_id: 'doc_1',
  consultation_price: '120',
  consultation_duration: '30',
  is_available: true,
  currency: 'CHF',
  video_enabled: true,
};

const SCHEDULE_ROW = {
  doctor_id: 'doc_1',
  day_of_week: 1,
  start_time: '09:00',
  end_time: '17:00',
  is_active: true,
};

// The handler fires all three sql.query calls before awaiting Promise.all,
// so they land in call order: 0=doctor_profiles, 1=consultation_settings, 2=doctor_schedule.
function wireQueries(doctors: unknown[] = [], settings: unknown[] = [], schedules: unknown[] = []) {
  let call = 0;
  query.mockImplementation(async () => [doctors, settings, schedules][call++] ?? []);
}

describe('api/_routes/doctors/list', () => {
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

  it('405 for write methods', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = mockRes();
      await handler(req(method), res);
      expect(res._status).toBe(405);
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('OPTIONS returns 200 without auth', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req('OPTIONS'), res);
    expect(res._status).toBe(200);
    expect(query).not.toHaveBeenCalled();
  });

  it('SQL for doctor_profiles contains the approved-only filter', async () => {
    wireQueries([], [], []);
    const res = mockRes();
    await handler(req(), res);
    const profileCall = query.mock.calls.find(c => /FROM doctor_profiles/.test(c[0] as string));
    expect(profileCall).toBeDefined();
    const sql = profileCall![0] as string;
    // Both clauses of APPROVED_DOCTOR_SQL must be present; dropping either
    // would expose unverified or rejected practitioners to patients.
    expect(sql).toContain('is_verified = true');
    expect(sql).toMatch(/verification_status.*approved/);
  });

  it('only doctors who have consultation settings appear (in-memory join)', async () => {
    // doc_2 has a profile row but no consultation_settings row.
    wireQueries([DOC_ROW, { ...DOC_ROW, user_id: 'doc_2' }], [SETTINGS_ROW], [SCHEDULE_ROW]);
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(200);
    const { doctors } = res._body as { doctors: Array<{ user_id: string }> };
    expect(doctors).toHaveLength(1);
    expect(doctors[0].user_id).toBe('doc_1');
  });

  it('private columns (email, phone, licence_number) never reach the response', async () => {
    wireQueries([DOC_ROW], [SETTINGS_ROW], [SCHEDULE_ROW]);
    const res = mockRes();
    await handler(req(), res);
    const json = JSON.stringify(res._body);
    expect(json).not.toContain('alice@clinic.com');
    expect(json).not.toContain('+41791234567');
    expect(json).not.toContain('CH-MED-123');
  });

  it('200 with an empty list when no doctors are available', async () => {
    wireQueries([], [], []);
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ doctors: [] });
  });

  it('500 on a database error', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await handler(req(), res);
    expect(res._status).toBe(500);
  });
});
