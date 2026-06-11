import * as Sentry from '@sentry/node';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let initialized = false;
function ensureInit() {
  if (initialized) return;
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
  initialized = true;
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

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
    try {
      return await handler(req, res);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { path: req.url, method: req.method },
      });
      await Sentry.flush(2000).catch(() => {});
      throw error;
    } finally {
      if (saw5xx !== null) {
        Sentry.captureMessage(`Handled HTTP ${saw5xx}: ${req.method} ${req.url}`, {
          level: 'error',
          tags: { path: req.url, method: req.method },
        });
        await Sentry.flush(2000).catch(() => {});
      }
    }
  };
}
