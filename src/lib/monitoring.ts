// Error monitoring (Sentry), loaded off the critical path.
//
// The Sentry SDK (with browser tracing) is ~43 KB gzip. Importing it
// statically put it in the entry chunk, so every first paint — including the
// logged-out landing page — downloaded and parsed it before React could
// render. It now loads (lib/sentryClient.ts) in parallel with the first
// render. Errors that happen before it arrives are held (up to MAX_QUEUED)
// and reported once it is ready, through the same scrubbing rules.

type SentryClient = typeof import('./sentryClient');
type CaptureContext = Parameters<SentryClient['captureException']>[1];

const MAX_QUEUED = 20;
let client: SentryClient | null = null;
let enabled = false;
const queued: Array<[unknown, CaptureContext | undefined]> = [];

function hold(error: unknown, context?: CaptureContext) {
  if (queued.length < MAX_QUEUED) queued.push([error, context]);
}

const onEarlyError = (e: ErrorEvent) => hold(e.error ?? e.message);
const onEarlyRejection = (e: PromiseRejectionEvent) => hold(e.reason);

function stopHolding() {
  window.removeEventListener('error', onEarlyError);
  window.removeEventListener('unhandledrejection', onEarlyRejection);
}

export function initMonitoring(dsn: string | undefined, environment: string): void {
  if (!dsn || enabled) return;
  enabled = true;
  window.addEventListener('error', onEarlyError);
  window.addEventListener('unhandledrejection', onEarlyRejection);
  // Wait for the page's own code (route chunk, fonts) to finish loading, so
  // the SDK download does not compete with it for a slow mobile connection.
  if (document.readyState === 'complete') load(dsn, environment);
  else window.addEventListener('load', () => load(dsn, environment), { once: true });
}

function load(dsn: string, environment: string): void {
  import('./sentryClient')
    .then((c) => {
      c.startSentry(dsn, environment);
      client = c;
      stopHolding(); // Sentry's own global handlers take over from here.
      for (const [error, context] of queued.splice(0)) c.captureException(error, context);
    })
    .catch(() => {
      // Offline or blocked: the app works without monitoring.
      stopHolding();
      queued.length = 0;
    });
}

export function captureException(error: unknown, context?: CaptureContext): void {
  if (client) client.captureException(error, context);
  else if (enabled) hold(error, context);
}
