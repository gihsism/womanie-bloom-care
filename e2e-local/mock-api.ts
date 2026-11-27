import type { Page, Route } from '@playwright/test';

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

function runDb(tables: Tables, b: DbBody, userId: string): Row[] {
  const t = (tables[b.table] ??= []);
  const filtered = () => t.filter((r) => (b.filters ?? []).every((f) => match(r, f)));
  const now = new Date().toISOString();
  switch (b.operation) {
    case 'insert': {
      const src = Array.isArray(b.insertData) ? b.insertData : [b.insertData ?? {}];
      const rows = src.map((r) => ({ id: newId(), created_at: now, user_id: userId, ...r }));
      t.push(...rows);
      return rows.map((r) => ({ ...r }));
    }
    case 'update': {
      const rows = filtered();
      rows.forEach((r) => Object.assign(r, b.updateData));
      return rows.map((r) => ({ ...r }));
    }
    case 'upsert': {
      const keys = (b.upsertOptions?.onConflict ?? 'id').split(',').map((s) => s.trim());
      const out: Row[] = [];
      for (const raw of Array.isArray(b.upsertData) ? b.upsertData : [b.upsertData ?? {}]) {
        // The server stamps the signed-in user's id, so onConflict
        // 'user_id,key' matches rows the client sent without user_id.
        const r: Row = { user_id: userId, ...raw };
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
    api.unhandled.push(`${method} ${path}`);
    return json(route, {});
  });
  return api;
}
