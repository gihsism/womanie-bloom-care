import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('../../_lib/auth.js', () => ({ getAuthUser: vi.fn() }));
vi.mock('../../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import handler, { bbtFromNote, bpEntries, weightEntries, TREND_APP_DATA_KEYS } from './patient-trends';
import { getAuthUser } from '../../_lib/auth.js';
import { ROUTES } from '../../router';

const DOCTOR = { id: 'doc_1', email: 'dr@test.com', sessionId: 'sess_dr1' };
const PATIENT_ID = 'patient_1';

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

function mockReq(patientId?: string, method = 'GET'): VercelRequest {
  return { method, headers: {}, query: patientId ? { id: patientId } : {} } as unknown as VercelRequest;
}

// Route the mocked SQL by the table it reads, so the order of the
// parallel queries does not matter.
function routeQueries(opts: { approved: boolean; appData?: Array<{ key: string; value: unknown }> }) {
  query.mockImplementation(async (sql: string) => {
    if (/doctor_patient_connections/.test(sql)) return opts.approved ? [{ id: 'conn_1' }] : [];
    if (/chart_access_log/.test(sql)) return [];
    if (/period_tracking/.test(sql)) return [
      { period_start_date: '2026-09-01', period_end_date: '2026-09-05' },
      { period_start_date: '2026-09-29', period_end_date: null },
    ];
    if (/daily_health_signals/.test(sql)) return [
      { signal_date: '2026-10-01', symptoms: ['cramps'], notes: 'BBT: 36.4°C. Private: argued with my sister' },
    ];
    if (/user_app_data/.test(sql)) return opts.appData ?? [];
    return [];
  });
}

describe('doctors/patient-trends access', () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(DOCTOR);
    query.mockReset();
  });

  it('is reachable through the router', () => {
    expect(ROUTES['doctors/patient-trends']).toBe(handler);
  });

  it('rejects anything but GET', async () => {
    const res = mockRes();
    await handler(mockReq(PATIENT_ID, 'POST'), res);
    expect(res._status).toBe(405);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 401 without a session and reads nothing', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 400 when the patient id is missing', async () => {
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(400);
  });

  it('returns 403 and reads no patient data without an approved connection', async () => {
    routeQueries({ approved: false });
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/status = 'approved'/);
    expect(params).toEqual([DOCTOR.id, PATIENT_ID]);
  });

  it('the consent gate also requires the doctor role (a revoked doctor reads nothing)', async () => {
    routeQueries({ approved: false });
    await handler(mockReq(PATIENT_ID), mockRes());
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/JOIN user_roles r ON r\.user_id = c\.doctor_id AND r\.role = 'doctor'/);
  });

  it('logs the read and scopes every data query to the gated patient', async () => {
    routeQueries({ approved: true });
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    const calls = query.mock.calls as Array<[string, unknown[]]>;
    const log = calls.find(([s]) => /chart_access_log/.test(s));
    expect(log?.[0]).toMatch(/'patient_trends'/);
    expect(log?.[1]).toEqual([DOCTOR.id, PATIENT_ID]);
    for (const [s, p] of calls.filter(([s]) => /period_tracking|daily_health_signals|user_app_data/.test(s))) {
      expect(s).toMatch(/WHERE user_id = \$1/);
      expect(p[0]).toBe(PATIENT_ID);
    }
  });

  it('asks user_app_data only for the weight and blood-pressure keys', async () => {
    routeQueries({ approved: true });
    await handler(mockReq(PATIENT_ID), mockRes());
    const app = (query.mock.calls as Array<[string, unknown[]]>).find(([s]) => /user_app_data/.test(s));
    expect(app?.[0]).toMatch(/key = ANY\(\$2\)/);
    expect(app?.[1][1]).toEqual(['preg_weight_log', 'maternal_weight', 'bp_log']);
    expect(TREND_APP_DATA_KEYS).not.toContain('emergency_contacts');
  });

  it('never returns the note text, only the parsed temperature', async () => {
    routeQueries({ approved: true });
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    const body = res._body as { signals: Array<Record<string, unknown>>; periods: unknown[] };
    expect(JSON.stringify(body)).not.toMatch(/sister/);
    expect(body.signals[0]).toEqual({ date: '2026-10-01', symptoms: ['cramps'], bbt: 36.4 });
    expect(body.periods).toEqual([
      { start: '2026-09-01', end: '2026-09-05' },
      { start: '2026-09-29', end: null },
    ]);
  });

  it('still answers when user_app_data cannot be read', async () => {
    routeQueries({ approved: true });
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, p: unknown[]) => {
      if (/user_app_data/.test(sql)) throw new Error('relation does not exist');
      return base(sql, p);
    });
    const res = mockRes();
    await handler(mockReq(PATIENT_ID), res);
    expect(res._status).toBe(200);
    expect((res._body as { weights: unknown[] }).weights).toEqual([]);
  });
});

describe('patient-trends parsers', () => {
  it('reads BBT in °C and °F and ignores nonsense', () => {
    expect(bbtFromNote('BBT: 36.55°C')).toBe(36.55);
    expect(bbtFromNote('BBT: 97.7 F')).toBeCloseTo(36.5, 1);
    expect(bbtFromNote('BBT: 12')).toBeNull();
    expect(bbtFromNote(null)).toBeNull();
  });

  it('merges both weight logs by date, dropping bad rows', () => {
    const w = weightEntries([
      { key: 'preg_weight_log', value: [{ date: '2026-06-01', kg: 60 }, { date: 'x', kg: 61 }, { date: '2026-06-08', kg: 'abc' }] },
      { key: 'maternal_weight', value: { prePregnancyKg: 58, entries: [{ date: '2026-06-01', kg: 99 }, { date: '2026-05-20', kg: 59.44 }] } },
      { key: 'bp_log', value: [{ date: '2026-06-01', kg: 70 }] },
    ]);
    expect(w).toEqual([{ date: '2026-05-20', kg: 59.4 }, { date: '2026-06-01', kg: 60 }]);
  });

  it('keeps only plausible blood-pressure readings, oldest first', () => {
    const bp = bpEntries([{ key: 'bp_log', value: [
      { date: '2026-06-02', systolic: 120, diastolic: 80 },
      { date: '2026-06-01', systolic: 118, diastolic: 76 },
      { date: '2026-06-03', systolic: 12, diastolic: 8 },
    ] }]);
    expect(bp.map(b => b.date)).toEqual(['2026-06-01', '2026-06-02']);
  });
});
