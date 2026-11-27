import * as Sentry from '@sentry/node';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Request bodies here are health data (chat turns, lab values, notes) and
// cookies carry the session JWT. sendDefaultPii:false already drops
// cookies/IP, but request `data` is not PII-gated, so every event passes
// through scrubEvent before it leaves the server:
//   - request: body, cookies and query string dropped; the URL keeps only
//     its path; cookie / authorization / API-key / forwarded-IP headers go
//   - user: only an opaque id may stay (no email, IP or name)
//   - breadcrumbs: console lines dropped (handlers log DB and AI errors that
//     can quote values), URLs cut to the path, bodies dropped
//   - extra / contexts / tags: any key that names a health field or a
//     secret is replaced by [Filtered], at any depth
//   - message and exception text: email addresses are masked
// The test in sentry.test.ts is the contract.

const SECRET_HEADER = /^(cookie|authorization|proxy-authorization|x-api-key|x-forwarded-for|x-real-ip|x-vercel-forwarded-for|x-vercel-proxy-signature|referer)$/i;

// Keys that hold (or describe) health data, personal details or secrets.
export const SENSITIVE_KEY = new RegExp(
  '^(' + [
    'content', 'messages?', 'prompt', 'body', 'data', 'text', 'notes?', 'question', 'answer',
    'value', 'values', 'result', 'results', 'unit', 'test_name', 'title', 'summary', 'ai_summary',
    'symptoms?', 'mood', 'flow', 'pain', 'temperature', 'weight', 'blood_?pressure', 'bbt',
    'medications?', 'dose', 'diagnosis', 'plan', 'cycle', 'period.*', 'pregnan.*', 'ivf.*', 'birth.*',
    'date_of_birth', 'dob', 'full_name', 'name', 'email', 'phone', 'address', 'ip_address',
    'password.*', 'token', 'secret', 'session', 'cookies?', 'authorization', 'api_?key', 'p256dh', 'auth',
    'file_name', 'file_path', 'license_number',
  ].join('|') + ')$',
  'i',
);

const SDK_CONTEXTS = new Set(['os', 'runtime', 'device', 'app', 'trace', 'culture', 'cloud_resource', 'otel']);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function stripUrl(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function maskText(v: unknown): unknown {
  return typeof v === 'string' ? v.replace(EMAIL, '[email]') : v;
}

export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return maskText(value);
  if (Array.isArray(value)) return value.map(v => redactDeep(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[Filtered]' : redactDeep(v, depth + 1);
  }
  return out;
}

type Crumb = { category?: string; message?: string; data?: Record<string, unknown> };
type ScrubbableEvent = {
  message?: string;
  transaction?: string;
  request?: { url?: string; data?: unknown; cookies?: unknown; query_string?: unknown; headers?: Record<string, string> };
  user?: Record<string, unknown>;
  breadcrumbs?: Crumb[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string }> };
  spans?: Array<{ description?: string; data?: Record<string, unknown> }>;
};

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const r = event.request;
  if (r) {
    delete r.data;
    delete r.cookies;
    delete r.query_string;
    if (r.url) r.url = stripUrl(r.url) as string;
    if (r.headers) {
      for (const k of Object.keys(r.headers)) {
        if (SECRET_HEADER.test(k)) delete r.headers[k];
      }
    }
  }
  if (event.user) {
    const id = event.user.id;
    event.user = id === undefined ? {} : { id };
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .filter(b => b.category !== 'console')
      .map(b => ({
        ...b,
        message: b.message === undefined ? undefined : String(maskText(stripUrl(b.message))),
        data: b.data ? (redactDeep(Object.fromEntries(
          Object.entries(b.data).map(([k, v]) => [k, /url|^to$|^from$/i.test(k) ? stripUrl(v) : v]),
        )) as Record<string, unknown>) : undefined,
      }));
  }
  if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) {
    // The SDK's own environment contexts (os, runtime, trace, ...) carry no
    // user data and are needed to read an error; everything else is redacted.
    for (const k of Object.keys(event.contexts)) {
      if (!SDK_CONTEXTS.has(k)) event.contexts[k] = redactDeep(event.contexts[k]);
    }
  }
  if (event.tags) {
    for (const k of Object.keys(event.tags)) {
      event.tags[k] = /url|path/i.test(k) ? stripUrl(event.tags[k]) : SENSITIVE_KEY.test(k) ? '[Filtered]' : event.tags[k];
    }
  }
  if (event.message) event.message = String(maskText(event.message));
  if (event.transaction) event.transaction = String(stripUrl(event.transaction));
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = String(maskText(ex.value));
  }
  for (const span of event.spans ?? []) {
    if (span.description) span.description = span.description.replace(/[?#]\S*/g, '');
    if (span.data) {
      for (const k of Object.keys(span.data)) {
        if (/url/i.test(k)) span.data[k] = stripUrl(span.data[k]);
      }
      delete span.data['http.query'];
      delete span.data['http.fragment'];
    }
  }
  return event;
}

let initialized = false;
function ensureInit() {
  if (initialized) return;
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
  });
  initialized = true;
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

// Set by api/router.ts before it dispatches. Routes behind the router are
// reached as /api/router?__route=<name>, so the URL path alone would file
// every one of them under "/api/router".
export const ROUTE_KEY = Symbol.for('womanie.route');

/** "db", "auth/me", "upload": the API route an event belongs to, never a query. */
export function routeName(req: VercelRequest): string {
  const tagged = (req as unknown as Record<symbol, unknown>)[ROUTE_KEY];
  if (typeof tagged === 'string' && tagged) return tagged;
  const q = req.query?.__route;
  if (typeof q === 'string' && q) return q;
  const path = String(stripUrl(req.url ?? '') ?? '');
  return path.replace(/^\/?api\//, '').replace(/^\/+|\/+$/g, '') || 'unknown';
}

export function withSentry(handler: Handler): Handler {
  ensureInit();
  return async (req, res) => {
    // Endpoints in this codebase catch their own errors and return a
    // 500 themselves, which means captureException below never fires
    // for the most common failure shape (the session-65 doctor-
    // directory outage was invisible to Sentry). Track status codes
    // and report handled 5xx responses too.
    let saw5xx: number | null = null;
    const origStatus = res.status.bind(res);
    res.status = (code: number) => {
      if (code >= 500) saw5xx = code;
      return origStatus(code);
    };
    // One report per failed request: a thrown error is reported as the
    // exception, and then not again as "Handled HTTP 500". Grouped per
    // route + status so one outage is one issue, not one per URL variant.
    let reported = false;
    try {
      return await handler(req, res);
    } catch (error) {
      const route = routeName(req);
      Sentry.captureException(error, {
        tags: { route, path: stripUrl(req.url) as string, method: req.method },
      });
      reported = true;
      await Sentry.flush(2000).catch(() => {});
      throw error;
    } finally {
      if (saw5xx !== null && !reported) {
        const route = routeName(req);
        Sentry.captureMessage(`Handled HTTP ${saw5xx}: ${req.method} /api/${route}`, {
          level: 'error',
          tags: { route, path: stripUrl(req.url) as string, method: req.method, status: String(saw5xx) },
          fingerprint: ['api-5xx', route, String(saw5xx)],
        });
        await Sentry.flush(2000).catch(() => {});
      }
    }
  };
}
