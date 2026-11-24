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

export function scrubErrorEvent(event: ErrorEvent): ErrorEvent {
  return scrubCommon(event);
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
