// Error monitoring (Sentry), loaded off the critical path.
//
// The Sentry SDK is ~25 KB gzip. Importing it statically put it in the entry
// chunk, so every first paint — including the logged-out landing page —
// downloaded and parsed it before React could render. It now loads in
// parallel with the first render. Errors that happen before it arrives are
// held (up to MAX_QUEUED) and reported once it is ready, so nothing early is
// lost; the scrubbing rules (sentryScrub.ts) apply to them like to any other.

type SentryModule = typeof import('@sentry/react');
type CaptureContext = Parameters<SentryModule['captureException']>[1];

const MAX_QUEUED = 20;
let sentry: SentryModule | null = null;
let enabled = false;
const queued: Array<[unknown, CaptureContext | undefined]> = [];

function hold(error: unknown, context?: CaptureContext) {
  if (queued.length < MAX_QUEUED) queued.push([error, context]);
}

const onEarlyError = (e: ErrorEvent) => hold(e.error ?? e.message);
const onEarlyRejection = (e: PromiseRejectionEvent) => hold(e.reason);

export function initMonitoring(dsn: string | undefined, environment: string): void {
  if (!dsn || enabled) return;
  enabled = true;
  window.addEventListener('error', onEarlyError);
  window.addEventListener('unhandledrejection', onEarlyRejection);
  Promise.all([import('@sentry/react'), import('./sentryScrub')])
    .then(([S, scrub]) => {
      S.init({
        dsn,
        environment,
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        integrations: [S.browserTracingIntegration()],
        // No console breadcrumbs, no request bodies, no query strings or
        // fragments in any URL (they can carry health data). See sentryScrub.ts.
        beforeBreadcrumb: scrub.scrubBreadcrumb,
        beforeSend: scrub.scrubErrorEvent,
        beforeSendTransaction: scrub.scrubTransaction,
      });
      sentry = S;
      // Sentry's own global handlers take over from here.
      window.removeEventListener('error', onEarlyError);
      window.removeEventListener('unhandledrejection', onEarlyRejection);
      for (const [error, context] of queued.splice(0)) S.captureException(error, context);
    })
    .catch(() => {
      // Offline or blocked: the app works without monitoring.
      window.removeEventListener('error', onEarlyError);
      window.removeEventListener('unhandledrejection', onEarlyRejection);
      queued.length = 0;
    });
}

export function captureException(error: unknown, context?: CaptureContext): void {
  if (sentry) sentry.captureException(error, context);
  else if (enabled) hold(error, context);
}
