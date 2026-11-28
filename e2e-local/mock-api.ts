import type { Page, Route } from '@playwright/test';
import { outsideRangeSince } from '../api/_lib/lab-flags';

// In-browser fake of the Womanie API for the local end-to-end suite.
// Every request to /api/** is answered here from fixture JSON; nothing
// reaches the network or the live database. /api/db is a small in-memory
// table store that understands the body the app's db client sends
// (filters, order, limit, insert/update/upsert/delete), so a page can write
// a row and read it back within one test.

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export interface MockApi {
  tables: Tables;
  /** Every /api request seen, as "METHOD /path" (db calls as "db <op> <table>"). */
  calls: string[];
  /** Requests no handler knew (answered with {}); tests assert this stays empty. */
  unhandled: string[];
}

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

type Filter = [string, string, unknown];

function match(row: Row, [col, op, val]: Filter): boolean {
  const v = row[col];
  switch (op) {
    case 'eq': return v === val || (v != null && val != null && String(v) === String(val));
    case 'neq': return String(v) !== String(val);
    case 'gt': return v != null && String(v) > String(val);
    case 'gte': return v != null && String(v) >= String(val);
    case 'lt': return v != null && String(v) < String(val);
    case 'lte': return v != null && String(v) <= String(val);
    case 'in': return Array.isArray(val) && val.map(String).includes(String(v));
    default: return true;
  }
}

interface DbBody {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  insertData: Row | Row[] | null;
  updateData: Row | null;
  upsertData: Row | Row[] | null;
  upsertOptions: { onConflict?: string } | null;
  filters: Filter[];
  orderBy: { column: string; ascending: boolean } | null;
  limitCount: number | null;
}

// JSONB columns: the client sends JSON.stringify(value) and Postgres keeps
// the parsed value, which the Neon driver hands back parsed (account-data
// relies on it). Without this the mock returned the string, and the
// account sync double-encoded every synced device key on the next load.
const JSONB_COLUMNS: Record<string, string[]> = { user_app_data: ['value'] };
function asStored(table: string, r: Row | null | undefined): Row {
  const out: Row = { ...(r ?? {}) };
  for (const c of JSONB_COLUMNS[table] ?? []) {
    if (typeof out[c] === 'string') { try { out[c] = JSON.parse(out[c] as string); } catch { /* keep as text */ } }
  }
  return out;
}

function runDb(tables: Tables, b: DbBody, userId: string): Row[] {
  const t = (tables[b.table] ??= []);
  const filtered = () => t.filter((r) => (b.filters ?? []).every((f) => match(r, f)));
  const now = new Date().toISOString();
  switch (b.operation) {
    case 'insert': {
      const src = Array.isArray(b.insertData) ? b.insertData : [b.insertData ?? {}];
      const rows = src.map((r) => ({ id: newId(), created_at: now, user_id: userId, ...asStored(b.table, r) }));
      t.push(...rows);
      return rows.map((r) => ({ ...r }));
    }
    case 'update': {
      const rows = filtered();
      rows.forEach((r) => Object.assign(r, asStored(b.table, b.updateData as Row)));
      return rows.map((r) => ({ ...r }));
    }
    case 'upsert': {
      const keys = (b.upsertOptions?.onConflict ?? 'id').split(',').map((s) => s.trim());
      const out: Row[] = [];
      for (const raw of Array.isArray(b.upsertData) ? b.upsertData : [b.upsertData ?? {}]) {
        // The server stamps the signed-in user's id, so onConflict
        // 'user_id,key' matches rows the client sent without user_id.
        const r: Row = { user_id: userId, ...asStored(b.table, raw) };
        const existing = t.find((x) => keys.every((k) => r[k] !== undefined && String(x[k]) === String(r[k])));
        if (existing) { Object.assign(existing, r); out.push({ ...existing }); }
        else { const n = { id: newId(), created_at: now, user_id: userId, ...r }; t.push(n); out.push({ ...n }); }
      }
      return out;
    }
    case 'delete': {
      const gone = filtered();
      tables[b.table] = t.filter((r) => !gone.includes(r));
      return gone;
    }
    default: {
      let rows = filtered();
      if (b.orderBy) {
        const { column, ascending } = b.orderBy;
        rows = [...rows].sort((a, z) => {
          const x = String(a[column] ?? ''); const y = String(z[column] ?? '');
          return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
        });
      }
      if (b.limitCount != null) rows = rows.slice(0, b.limitCount);
      return rows.map((r) => ({ ...r }));
    }
  }
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** The canned Ask-AI answer, streamed the way /api/ai-doctor-chat streams it. */
export const CANNED_ANSWER =
  'Drinking enough water keeps your blood volume up, which can ease a tension headache. This is general information, not a diagnosis.';

function cannedStream(): string {
  const words = CANNED_ANSWER.split(' ');
  const chunks = words.map((w, i) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: (i ? ' ' : '') + w } }] })}\n\n`);
  return `${chunks.join('')}data: ${JSON.stringify({ meta: { followUps: [], records: [], messageId: null } })}\n\ndata: [DONE]\n\n`;
}

export interface MockOptions {
  user: Row;
  tables: Tables;
  /** Rows /api/me/appointments returns (already joined with the doctor, as the server does). */
  appointments?: Row[];
  /** Extra JSON answers by path (no query string), e.g. { '/api/me/appointments': {...} }. */
  json?: Record<string, unknown>;
}

export async function installMockApi(page: Page, opts: MockOptions): Promise<MockApi> {
  const tables: Tables = structuredClone(opts.tables);
  const api: MockApi = { tables, calls: [], unhandled: [] };
  const userId = String(opts.user.id);
  const extra = opts.json ?? {};

  const isLocal = (url: URL) => /^(localhost|127\.0\.0\.1)$/.test(url.hostname);

  // Anything not on the preview server (fonts, Sentry, analytics, CDNs) is
  // answered empty here, so the suite never needs the network.
  await page.context().route((url) => !isLocal(url), (route) =>
    route.fulfill({ status: 204, body: '' }));

  // Only the app's own origin. A bare '**/api/**' glob also matches other
  // hosts' /api paths (Sentry ingest is https://o….sentry.io/api/<id>/envelope/),
  // and the last-registered route wins, so a build with VITE_SENTRY_DSN set
  // recorded every Sentry client report as an unhandled endpoint.
  await page.context().route((url) => isLocal(url) && url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    let body: Row = {};
    try { body = (req.postDataJSON() as Row | null) ?? {}; } catch { /* not JSON */ }

    if (path === '/api/db') {
      const b = body as unknown as DbBody;
      api.calls.push(`db ${b.operation} ${b.table}`);
      const rows = runDb(tables, b, userId);
      return json(route, { rows, rowCount: rows.length });
    }
    api.calls.push(`${method} ${path}`);
    if (path in extra) return json(route, extra[path]);

    switch (path) {
      case '/api/auth/me': return json(route, { user: opts.user });
      case '/api/maintenance': return json(route, { maintenance: false });
      case '/api/chat/messages':
        if (method === 'GET') return json(route, { messages: tables.chat_messages ?? [], hasMore: false, earliestCursor: null });
        return json(route, { ok: true, imported: 0 });
      case '/api/chat/conversation':
      case '/api/chat/feedback':
      case '/api/push/subscription':
        return json(route, { ok: true });
      case '/api/ai-doctor-chat':
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: cannedStream() });
      case '/api/docs/file':
        return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF\n' });
      case '/api/me/appointments': {
        const upcoming = /^(true|1)$/.test(url.searchParams.get('upcoming') ?? '');
        const now = Date.now();
        const list = (opts.appointments ?? []).filter((a) =>
          !upcoming || (new Date(String(a.scheduled_at)).getTime() >= now && a.status !== 'cancelled'));
        return json(route, { appointments: list });
      }
      case '/api/me/doctor-notes': return json(route, { notes: [] });
      case '/api/me/chart-access': return json(route, { accesses: [] });
      case '/api/me/consents': return json(route, { consents: [] });
      case '/api/docs/pending-retries': return json(route, { retries: [] });
      case '/api/docs/from-doctor': return json(route, { documents: [] });
      case '/api/connections/pending': return json(route, { pending: [] });
      case '/api/connections/approved': return json(route, { approved: [] });
      case '/api/push/config': return json(route, { enabled: false });
      case '/api/summary/generate':
        return json(route, {
          summary: '**This week:** ferritin is a little low; vitamin D is in range.',
          generatedAt: new Date().toISOString(), cached: true, weekBucket: 'e2e',
        });
    }
    if (path.startsWith('/api/doctors/')) {
      const answer = doctorRoute(tables, userId, path, url);
      if (answer) return json(route, answer.body, answer.status);
    }
    api.unhandled.push(`${method} ${path}`);
    return json(route, {});
  });
  return api;
}

// ---- Doctor side -------------------------------------------------------
// The consent-gated doctor endpoints, answered from the same tables the
// page writes through /api/db (so a note saved in the chart comes back on
// the next chart load). Same gates as the server: the doctor role AND an
// APPROVED connection; a revoked doctor (no role row) gets 403 everywhere.

const ymd = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : null);
const byTime = (col: string, asc = false) => (a: Row, z: Row) =>
  (String(a[col] ?? '') < String(z[col] ?? '') ? -1 : 1) * (asc ? 1 : -1);

function doctorRoute(tables: Tables, doctorId: string, path: string, url: URL): { status: number; body: unknown } | null {
  const rows = (t: string) => tables[t] ?? [];
  const isDoctor = rows('user_roles').some((r) => r.user_id === doctorId && r.role === 'doctor');
  const forbidden = { status: 403, body: { error: 'No approved connection to this patient' } };
  // Revoked: no patients in the list, every visit unapproved, charts 403.
  const conns = isDoctor ? rows('doctor_patient_connections').filter((c) => c.doctor_id === doctorId) : [];
  const approved = (pid: unknown) => conns.some((c) => c.patient_id === pid && c.status === 'approved');
  const profile = (pid: unknown) => rows('profiles').find((p) => p.id === pid) ?? null;
  const mine = (t: string, pid: unknown) => rows(t).filter((r) => r.user_id === pid);

  switch (path) {
    case '/api/doctors/connections':
      return { status: 200, body: { connections: conns.map((c) => {
        const ok = c.status === 'approved';
        const docs = mine('health_documents', c.patient_id).sort(byTime('uploaded_at'));
        return {
          ...c,
          patient_full_name: profile(c.patient_id)?.full_name ?? null,
          patient_life_stage: ok ? profile(c.patient_id)?.life_stage ?? null : null,
          last_upload_at: ok ? docs[0]?.uploaded_at ?? null : null,
          recent_doc_count: ok ? docs.filter((d) => Date.parse(String(d.uploaded_at)) > Date.now() - 14 * 86_400_000).length : 0,
        };
      }) } };
    case '/api/doctors/patient': {
      const pid = url.searchParams.get('id');
      if (!approved(pid)) return forbidden;
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const appts = rows('appointments').filter((a) => a.doctor_id === doctorId && a.patient_id === pid);
      const apptIds = new Set(appts.filter((a) => a.status !== 'cancelled').map((a) => a.id));
      return { status: 200, body: {
        profile: profile(pid),
        healthSignals: mine('daily_health_signals', pid).filter((s) => String(s.signal_date) >= cutoff).sort(byTime('signal_date')),
        documents: mine('health_documents', pid).sort(byTime('uploaded_at')).map((d) => ({ ...d, has_file: !!d.file_path, sent_by_me: false, sent_note: null })),
        medicalData: mine('current_extracted_data', pid).sort(byTime('date_recorded')),
        notes: rows('doctor_notes').filter((n) => n.doctor_id === doctorId && n.patient_id === pid).sort(byTime('created_at')),
        appointments: [...appts].sort(byTime('scheduled_at')),
        periodRecords: mine('period_tracking', pid).sort(byTime('period_start_date', true))
          .map((p) => ({ period_start_date: p.period_start_date, cycle_length: p.cycle_length })),
        visitQuestions: mine('visit_questions', pid).filter((q) => apptIds.has(q.appointment_id)).map((q) => ({
          appointment_id: q.appointment_id, questions: q.questions, updated_at: q.updated_at,
          scheduled_at: appts.find((a) => a.id === q.appointment_id)?.scheduled_at,
        })),
        medicines: mine('medications', pid).filter((m) => m.active !== false),
        birthPlan: null,
      } };
    }
    case '/api/doctors/patient-trends': {
      const pid = url.searchParams.get('id');
      if (!approved(pid)) return forbidden;
      return { status: 200, body: {
        periods: mine('period_tracking', pid).sort(byTime('period_start_date', true))
          .map((p) => ({ start: ymd(p.period_start_date), end: ymd(p.period_end_date) })),
        signals: mine('daily_health_signals', pid).sort(byTime('signal_date', true))
          .map((s) => ({ date: ymd(s.signal_date), symptoms: (s.symptoms as string[] | null) ?? [], bbt: null })),
        weights: [],
        bloodPressure: [],
      } };
    }
    case '/api/doctors/day': {
      const from = Date.parse(url.searchParams.get('from') ?? '');
      const to = Date.parse(url.searchParams.get('to') ?? '');
      const visits = rows('appointments')
        .filter((a) => a.doctor_id === doctorId && a.status !== 'cancelled')
        .filter((a) => { const at = Date.parse(String(a.scheduled_at)); return at >= from && at < to; })
        .sort(byTime('scheduled_at', true))
        .map((a) => {
          const base = { appointment_id: a.id, patient_id: a.patient_id, scheduled_at: a.scheduled_at, status: a.status,
            consultation_type: a.consultation_type, duration: a.duration, approved: approved(a.patient_id) };
          if (!base.approved) return base;
          const p = profile(a.patient_id);
          const last = rows('appointments')
            .filter((x) => x.doctor_id === doctorId && x.patient_id === a.patient_id && x.status === 'completed' && Date.parse(String(x.scheduled_at)) < Date.now())
            .map((x) => Date.parse(String(x.scheduled_at))).sort((x, y) => y - x)[0];
          const docs = mine('health_documents', a.patient_id);
          const uploaded = new Map(docs.map((d) => [d.id, Date.parse(String(d.uploaded_at))]));
          const q = mine('visit_questions', a.patient_id).find((v) => v.appointment_id === a.id);
          const open = Array.isArray(q?.questions) ? (q.questions as Row[]).filter((x) => x.asked !== true).length : 0;
          const labs = mine('current_extracted_data', a.patient_id).map((r) => ({
            title: r.title as string, data_type: r.data_type as string, date_recorded: r.date_recorded as string, status: r.status as string,
            arrived: uploaded.get(r.document_id) ?? NaN,
          }));
          return { ...base,
            life_stage: p?.life_stage ?? null, pregnancy_due_date: p?.pregnancy_due_date ?? null, ivf_phase: p?.ivf_phase ?? null,
            open_questions: open,
            last_visit_at: last ? new Date(last).toISOString() : null,
            new_docs: last ? docs.filter((d) => Date.parse(String(d.uploaded_at)) > last).length : 0,
            new_abnormal: last ? outsideRangeSince(labs, last, (r) => r.arrived).length : 0,
            low_mood_streak: 0,
          };
        });
      return { status: 200, body: { visits } };
    }
  }
  return null;
}
