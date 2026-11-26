import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler from './profile';
import listHandler from './list';
import { getAuthUser } from '../../_lib/auth.js';
import { ROUTES } from '../../router';

function mockRes() {
  const r = { _status: 200, _body: null as unknown, setHeader: vi.fn(), end: vi.fn() } as Record<string, unknown>;
  r.status = (c: number) => { r._status = c; return r; };
  r.json = (b: unknown) => { r._body = b; return r; };
  return r as typeof r & VercelResponse & { _status: number; _body: Record<string, unknown> };
}
const req = (q: Record<string, string>, method = 'GET') => ({ method, headers: {}, query: q }) as unknown as VercelRequest;

// A row as a careless SELECT * would return it: every private column a
// doctor_profiles / consultation_settings row can hold.
const PRIVATE = {
  email: 'dr.secret@clinic.ch',
  phone: '+41 79 000 00 00',
  license_number: 'GLN-7601000000000',
  verification_status: 'approved',
  is_admin: true,
  internal_notes: 'flagged by ops',
  stripe_account_id: 'acct_123',
  password_hash: 'x',
};
// Tuesdays 09:00-12:00 Swiss time, 30-minute visits.
const SCHEDULE = [{ day_of_week: 2, start_time: '09:00:00', end_time: '12:00:00', is_active: true }];
const DOCTOR = {
  user_id: 'doc_1', full_name: 'Anna Keller', title: 'Dr. med.', specialties: ['Gynaecology', 'Menopause'],
  years_experience: 12, bio: 'Gynaecologist in Zurich.', avatar_url: 'https://img/a.jpg', rating: '4.8',
  review_count: 20, languages: ['German', 'English'], credentials: ['FMH'],
  practice_address: 'Bahnhofstrasse 1, 8001 Zürich',
  consultation_price: 120, currency: 'CHF', consultation_duration: 30, video_enabled: true,
  is_available: true, is_verified: true,
  schedule: SCHEDULE,
  ...PRIVATE,
};

const leaks = (body: unknown) => {
  const text = JSON.stringify(body);
  return ['dr.secret@clinic.ch', 'GLN-7601000000000', '+41 79', 'flagged by ops', 'acct_123',
    '"email"', '"phone"', '"license_number"', '"verification_status"', '"is_admin"', '"internal_notes"', '"password_hash"']
    .filter(s => text.includes(s));
};

beforeEach(() => {
  query.mockReset();
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'p1' } as never);
  // Monday 2099-01-05 12:00 Zurich.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2099-01-05T11:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); });

describe('doctors/profile', () => {
  it('is registered on the router', () => {
    expect(ROUTES['doctors/profile']).toBe(handler);
  });

  it('requires a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(req({ doctor_id: 'doc_1' }), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('is read-only', async () => {
    const res = mockRes();
    await handler(req({ doctor_id: 'doc_1' }, 'POST'), res);
    expect(res._status).toBe(405);
    expect(query).not.toHaveBeenCalled();
  });

  it('needs a doctor_id', async () => {
    const res = mockRes();
    await handler(req({}), res);
    expect(res._status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('only finds approved doctors with bookings on (filtered in SQL, id bound as a parameter)', async () => {
    query.mockResolvedValueOnce([]);
    const res = mockRes();
    await handler(req({ doctor_id: "doc_1' OR 1=1 --" }), res);
    expect(res._status).toBe(404);
    const [text, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(["doc_1' OR 1=1 --"]);
    expect(text).toMatch(/dp\.is_verified = true/);
    expect(text).toMatch(/verification_status, 'approved'\) = 'approved'/);
    expect(text).toMatch(/cs\.is_available = true/);
    expect(text).not.toMatch(/email|license|phone/);
    // A paused or pending doctor gives the same answer as an unknown id.
    expect(JSON.stringify(res._body)).not.toMatch(/pending|paused|verif/i);
  });

  it('never returns email, licence number, phone or internal flags, even if the row carries them', async () => {
    query.mockResolvedValueOnce([DOCTOR]).mockResolvedValueOnce([]);
    const res = mockRes();
    await handler(req({ doctor_id: 'doc_1' }), res);
    expect(res._status).toBe(200);
    expect(leaks(res._body)).toEqual([]);
    const doctor = res._body.doctor as Record<string, unknown>;
    expect(Object.keys(doctor).sort()).toEqual([
      'avatar_url', 'bio', 'consultation_settings', 'credentials', 'full_name', 'is_verified', 'languages',
      'practice_address', 'rating', 'review_count', 'schedule', 'specialties', 'title', 'user_id', 'years_experience',
    ]);
    expect(doctor.rating).toBe(4.8);
    expect(doctor.consultation_settings).toEqual({
      consultation_price: 120, currency: 'CHF', consultation_duration: 30, video_enabled: true,
      is_available: true, visit_types: ['in_person', 'video'],
    });
  });

  it('lists the next 3 free times in Swiss time, skipping booked ones, without patient identity', async () => {
    query
      .mockResolvedValueOnce([DOCTOR])
      // 09:00 Zurich on Tue 6 Jan is taken.
      .mockResolvedValueOnce([{ scheduled_at: '2099-01-06T08:00:00.000Z', duration: 30 }]);
    const res = mockRes();
    await handler(req({ doctor_id: 'doc_1' }), res);
    expect(res._body.next_slots).toEqual([
      '2099-01-06T08:30:00.000Z', // 09:30 Zurich
      '2099-01-06T09:00:00.000Z',
      '2099-01-06T09:30:00.000Z',
    ]);
    expect(res._body.time_zone).toBe('Europe/Zurich');
    const [text, params] = query.mock.calls[1] as [string, unknown[]];
    expect(text).toMatch(/SELECT scheduled_at, duration\s+FROM appointments/);
    expect(text).not.toMatch(/patient_id|notes/);
    expect(text).toMatch(/<> 'cancelled'/);
    expect(params[0]).toBe('doc_1');
  });

  it('offers in-person only when video is off', async () => {
    query.mockResolvedValueOnce([{ ...DOCTOR, video_enabled: false }]).mockResolvedValueOnce([]);
    const res = mockRes();
    await handler(req({ doctor_id: 'doc_1' }), res);
    const cs = (res._body.doctor as Record<string, Record<string, unknown>>).consultation_settings;
    expect(cs.visit_types).toEqual(['in_person']);
  });
});

describe('doctors/list (directory) privacy', () => {
  it('returns only whitelisted fields and filters to approved doctors', async () => {
    query
      .mockResolvedValueOnce([DOCTOR, { ...DOCTOR, user_id: 'doc_2' }])
      .mockResolvedValueOnce([{ doctor_id: 'doc_1', consultation_price: 0, currency: 'CHF', consultation_duration: 45, is_available: true, video_enabled: false, stripe_account_id: 'acct_123' }])
      .mockResolvedValueOnce([{ doctor_id: 'doc_1', ...SCHEDULE[0], internal_notes: 'flagged by ops' }]);
    const res = mockRes();
    await listHandler(req({}), res);
    expect(res._status).toBe(200);
    expect(leaks(res._body)).toEqual([]);
    const doctors = res._body.doctors as Array<Record<string, unknown>>;
    // doc_2 has no bookable settings: hidden.
    expect(doctors.map(d => d.user_id)).toEqual(['doc_1']);
    expect((doctors[0].consultation_settings as Record<string, unknown>).consultation_price).toBe(0);
    const [text] = query.mock.calls[0] as [string];
    expect(text).toMatch(/verification_status, 'approved'\) = 'approved'/);
    expect(text).not.toMatch(/email|license|phone/);
  });

  it('requires a session', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await listHandler(req({}), res);
    expect(res._status).toBe(401);
  });
});
