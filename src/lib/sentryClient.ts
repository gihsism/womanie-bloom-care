// The parts of the Sentry SDK the app uses, behind one lazily-imported module.
// Named imports (not `import('@sentry/react')` directly) keep the SDK
// tree-shaken: a dynamic import of the whole package pulls in every
// integration (~470 KB) instead of the ~130 KB actually used.
import { browserTracingIntegration, captureException, init } from '@sentry/react';
import { scrubBreadcrumb, scrubErrorEvent, scrubTransaction } from './sentryScrub';

export { captureException };

export function startSentry(dsn: string, environment: string): void {
  init({
    dsn,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [browserTracingIntegration()],
    // No console breadcrumbs, no request bodies, no query strings or
    // fragments in any URL (they can carry health data). See sentryScrub.ts.
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubErrorEvent,
    beforeSendTransaction: scrubTransaction,
  });
}
