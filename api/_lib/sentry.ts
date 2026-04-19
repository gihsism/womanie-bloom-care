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
    try {
      return await handler(req, res);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { path: req.url, method: req.method },
      });
      await Sentry.flush(2000).catch(() => {});
      throw error;
    }
  };
}
