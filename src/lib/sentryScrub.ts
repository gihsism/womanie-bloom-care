// Client-side Sentry scrubbing. The browser SDK records breadcrumbs for
// console calls (the app logs lab values, AI replies, form state), fetch/XHR
// calls and navigations, and attaches the page URL to every event. Query
// strings and fragments can carry health data (search terms, ids, tokens),
// so only the bare path ever leaves the device, and console breadcrumbs
// are dropped entirely.

import type { Breadcrumb, BrowserOptions, ErrorEvent } from '@sentry/react';

export type TransactionEvent = Parameters<NonNullable<BrowserOptions['beforeSendTransaction']>>[0];

/** Drop the query string and fragment; keep scheme/host/path. */
export function stripUrl(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

const URL_KEYS = ['url', 'from', 'to'];
const BODY_KEYS = ['body', 'request_body', 'response_body', 'data', 'input', 'arguments'];

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null;
  if (crumb.data) {
    const data: Record<string, unknown> = { ...crumb.data };
    for (const k of URL_KEYS) if (k in data) data[k] = stripUrl(data[k]);
    for (const k of BODY_KEYS) delete data[k];
    delete data['http.query'];
    delete data['http.fragment'];
    crumb = { ...crumb, data };
  }
  if ((crumb.category === 'fetch' || crumb.category === 'xhr' || crumb.category === 'navigation') && crumb.message) {
    crumb = { ...crumb, message: String(stripUrl(crumb.message)) };
  }
  return crumb;
}

type WithRequest = {
  request?: { url?: string; data?: unknown; query_string?: unknown; cookies?: unknown; headers?: Record<string, string> };
  breadcrumbs?: Breadcrumb[];
};

function scrubCommon<E extends WithRequest>(event: E): E {
  const r = event.request;
  if (r) {
    if (r.url) r.url = stripUrl(r.url) as string;
    delete r.data;
    delete r.query_string;
    delete r.cookies;
    if (r.headers) {
      for (const k of Object.keys(r.headers)) {
        if (/^(cookie|authorization|referer)$/i.test(k)) delete r.headers[k];
      }
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}

// Keys that hold (or describe) health data, personal details or secrets.
// The server's list (api/_lib/sentry.ts) plus request fields. An unhandled rejection with
// a plain object (a failed /api/db answer, a row) arrives as
// extra.__serialized__ with every field, so extra and contexts are
// filtered by key at any depth.
export const SENSITIVE_KEY = new RegExp(
  '^(' + [
    'content', 'messages?', 'prompt', 'body', 'data', 'text', 'notes?', 'question', 'answer',
    'value', 'values', 'result', 'results', 'unit', 'test_name', 'title', 'summary', 'ai_summary',
    'symptoms?', 'mood', 'flow', 'pain', 'temperature', 'weight', 'blood_?pressure', 'bbt',
    'medications?', 'dose', 'diagnosis', 'plan', 'cycle', 'period.*', 'pregnan.*', 'ivf.*', 'birth.*',
    'date_of_birth', 'dob', 'full_name', 'name', 'email', 'phone', 'address', 'ip_address',
    'password.*', 'token', 'secret', 'session', 'cookies?', 'authorization', 'api_?key', 'p256dh', 'auth',
    'file_.*', 'license_number', 'rows', 'row', 'insertData', 'updateData', 'upsertData', 'filters',
  ].join('|') + ')$',
  'i',
);

const SDK_CONTEXTS = new Set(['os', 'browser', 'device', 'app', 'trace', 'culture', 'runtime', 'otel']);
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

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

export function scrubErrorEvent(event: ErrorEvent): ErrorEvent {
  scrubCommon(event);
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
  if (event.extra) event.extra = redactDeep(event.extra) as Record<string, unknown>;
  if (event.contexts) {
    for (const k of Object.keys(event.contexts)) {
      if (!SDK_CONTEXTS.has(k)) event.contexts[k] = redactDeep(event.contexts[k]) as Record<string, unknown>;
    }
  }
  if (event.message) event.message = String(maskText(event.message));
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = String(maskText(ex.value));
  }
  return event;
}

/** Performance events: http.client spans carry full request URLs. */
export function scrubTransaction(event: TransactionEvent): TransactionEvent {
  scrubCommon(event);
  if (event.transaction) event.transaction = String(stripUrl(event.transaction));
  for (const span of event.spans ?? []) {
    if (span.description) {
      // "GET https://host/api/x?y=1" -> "GET https://host/api/x"
      span.description = span.description.replace(/[?#]\S*/g, '');
    }
    if (span.data) {
      for (const k of ['url', 'http.url', 'server.address.full']) {
        if (k in span.data) span.data[k] = stripUrl(span.data[k]) as string;
      }
      delete span.data['http.query'];
      delete span.data['http.fragment'];
    }
  }
  return event;
}
