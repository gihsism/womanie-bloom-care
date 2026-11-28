import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler, { lowMoodStreak, openQuestionCount } from './day';
import { getAuthUser } from '../../_lib/auth.js';
import { ROUTES } from '../../router';

const DOCTOR = { id: 'doc_1', email: 'dr@test.com', sessionId: 'sess_dr1' };
const FROM = '2026-11-26T00:00:00.000Z';
const TO = '2026-11-28T00:00:00.000Z';

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

function mockReq(q: Record<string, string> = { from: FROM, to: TO }, method = 'GET'): VercelRequest {
  return { method, headers: {}, query: q } as unknown as VercelRequest;
}

const APPTS = [
  { id: 'a1', patient_id: 'p_ok', scheduled_at: '2026-11-26T09:00:00Z', status: 'scheduled', consultation_type: 'video', duration: 30, approved: true },
  { id: 'a2', patient_id: 'p_pending', scheduled_at: '2026-11-26T10:00:00Z', status: 'scheduled', consultation_type: null, duration: 30, approved: false },
];

function routeQueries(opts: { appts?: typeof APPTS; vqFails?: boolean; vqRows?: unknown[] } = {}) {
  query.mockImplementation(async (sql: string) => {
    if (/FROM appointments a/.test(sql)) return opts.appts ?? APPTS;
    if (/chart_access_log/.test(sql)) return [];
    if (/FROM profiles/.test(sql)) return [{ id: 'p_ok', life_stage: 'pregnancy', pregnancy_due_date: '2027-03-01', ivf_phase: null }];
    if (/WITH last_visit/.test(sql)) return [{ patient_id: 'p_ok', last_visit_at: '2026-10-01T09:00:00Z', new_docs: '2', new_abnormal: '1' }];
    if (/daily_health_signals/.test(sql)) return [
      { user_id: 'p_ok', signal_date: '2026-11-25', mood: ['sad'] },
      { user_id: 'p_ok', signal_date: '2026-11-24', mood: ['anxious'] },
      { user_id: 'p_ok', signal_date: '2026-11-23', mood: ['irritable', 'calm'] },
    ];
    if (/visit_questions/.test(sql)) {
      if (opts.vqFails) throw new Error('relation "visit_questions" does not exist');
      return opts.vqRows ?? [{ user_id: 'p_ok', appointment_id: 'a1', questions: [{ id: 'q', text: 'Is this normal?', asked: false }, { id: 'r', text: 'Travel?', asked: true }] }];
    }
    return [];
  });
}

/** Every patient-scoped query's parameters, flattened. */
function patientScopedParams(): unknown[] {
  return query.mock.calls
    .filter(([sql]) => !/FROM appointments a\b/.test(sql as string) || /WITH last_visit/.test(sql as string))
    .flatMap(([, params]) => (params as unknown[]).flat());
}

describe('doctors/day access', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockReset();
  });

  it('is reachable through the router', () => {
    expect(ROUTES['doctors/day']).toBe(handler);
  });

  it('rejects anything but GET', async () => {
    const res = mockRes();
    await handler(mockReq(undefined, 'POST'), res);
    expect(res._status).toBe(405);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 401 without a session and reads nothing', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a missing, reversed or too-wide window', async () => {
    for (const q of [{} as Record<string, string>, { from: TO, to: FROM }, { from: FROM, to: '2026-12-26T00:00:00Z' }, { from: 'x', to: TO }]) {
      const res = mockRes();
      await handler(mockReq(q), res);
      expect(res._status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("reads only the doctor's own appointments and decides approval server-side", async () => {
    routeQueries();
    await handler(mockReq(), mockRes());
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/a\.doctor_id = \$1/);
    expect(sql).toMatch(/c\.status = 'approved'/);
    expect(params[0]).toBe('doc_1');
  });

  // A revoked doctor (admin deleted the role, connection rows stay) must
  // see her visits as times only, like a pending patient.
  it('counts a connection as approved only while the doctor still holds the doctor role', async () => {
    routeQueries();
    await handler(mockReq(), mockRes());
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/JOIN user_roles r ON r\.user_id = c\.doctor_id AND r\.role = 'doctor'/);
  });

  it('gives a pending patient no health fields and never queries her data', async () => {
    routeQueries();
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    const visits = (res._body as { visits: Array<Record<string, unknown>> }).visits;
    const pending = visits.find(v => v.patient_id === 'p_pending')!;
    expect(pending).toEqual({
      appointment_id: 'a2', patient_id: 'p_pending', scheduled_at: '2026-11-26T10:00:00Z',
      status: 'scheduled', consultation_type: null, duration: 30, approved: false,
    });
    expect(patientScopedParams()).not.toContain('p_pending');
    expect(patientScopedParams()).not.toContain('a2');
  });

  it('returns stage, open questions and what is new since the last completed visit for an approved patient', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-26T08:00:00Z'), toFake: ['Date'] });
    try {
      routeQueries();
      const res = mockRes();
      await handler(mockReq(), res);
      const ok = (res._body as { visits: Array<Record<string, unknown>> }).visits.find(v => v.patient_id === 'p_ok')!;
      expect(ok).toMatchObject({
        approved: true,
        life_stage: 'pregnancy',
        pregnancy_due_date: '2027-03-01',
        open_questions: 1,
        last_visit_at: '2026-10-01T09:00:00Z',
        new_docs: 2,
        new_abnormal: 1,
        low_mood_streak: 3,
      });
      // Counts only: no document names, values, question text or moods.
      expect(JSON.stringify(res._body)).not.toMatch(/Is this normal|sad|anxious/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('scopes the last-visit lookup to this doctor and completed visits', async () => {
    routeQueries();
    await handler(mockReq(), mockRes());
    const call = query.mock.calls.find(([sql]) => /WITH last_visit/.test(sql as string)) as [string, unknown[]];
    expect(call[0]).toMatch(/doctor_id = \$1/);
    expect(call[0]).toMatch(/status = 'completed'/);
    expect(call[1][0]).toBe('doc_1');
    expect(call[1][1]).toEqual(['p_ok']);
  });

  it("ignores a questions row that is not the patient's own visit", async () => {
    routeQueries({ vqRows: [{ user_id: 'someone_else', appointment_id: 'a1', questions: [{ text: 'x' }] }] });
    const res = mockRes();
    await handler(mockReq(), res);
    const ok = (res._body as { visits: Array<Record<string, unknown>> }).visits.find(v => v.patient_id === 'p_ok')!;
    expect(ok.open_questions).toBe(0);
  });

  it('logs each approved patient shown, and only them', async () => {
    routeQueries();
    await handler(mockReq(), mockRes());
    const log = query.mock.calls.find(([sql]) => /chart_access_log/.test(sql as string)) as [string, unknown[]];
    expect(log[0]).toMatch(/'doctor_day'/);
    expect(log[1]).toEqual(['doc_1', ['p_ok']]);
  });

  it('reads no patient data and logs nothing when no visit is approved', async () => {
    routeQueries({ appts: [APPTS[1]] });
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('still answers before migration 012 (no visit_questions table)', async () => {
    routeQueries({ vqFails: true });
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
  });
});

describe('doctors/day helpers', () => {
  it('counts open questions, tolerating strings and junk', () => {
    expect(openQuestionCount([{ text: 'a' }, { text: 'b', asked: true }, { text: '  ' }, null])).toBe(1);
    expect(openQuestionCount('[{"text":"a","asked":false}]')).toBe(1);
    expect(openQuestionCount('nope')).toBe(0);
    expect(openQuestionCount(undefined)).toBe(0);
  });

  it('counts a low-mood run ending on her latest recent log', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    const s = (d: string, mood: string[]) => ({ signal_date: d, mood });
    expect(lowMoodStreak([s('2026-11-26', ['sad']), s('2026-11-25', ['sad']), s('2026-11-24', ['happy']), s('2026-11-23', ['sad'])], now)).toBe(2);
    // A gap breaks the run.
    expect(lowMoodStreak([s('2026-11-26', ['sad']), s('2026-11-24', ['sad'])], now)).toBe(1);
    // Latest log is old: no current streak.
    expect(lowMoodStreak([s('2026-11-10', ['sad']), s('2026-11-09', ['sad'])], now)).toBe(0);
    // Latest day is calm.
    expect(lowMoodStreak([s('2026-11-26', ['calm']), s('2026-11-25', ['sad'])], now)).toBe(0);
    expect(lowMoodStreak([], now)).toBe(0);
  });
});
