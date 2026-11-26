import type { VercelRequest, VercelResponse } from '@vercel/node';

// Maintenance (read-only) mode for a planned database move, e.g. the EU
// region migration in docs/eu-region-migration.md.
//
// OFF unless the Vercel env var MAINTENANCE_MODE is set to 1 / true / on
// (and the project redeployed, since env changes apply to new deployments).
// While ON:
//   - nothing can be written: every API route answers 503 + Retry-After,
//     except the short read-only list below, so no row lands in the old
//     database after the copy has been taken (no silent data loss);
//   - reads that the app needs to show her data keep working: the session
//     check (auth/me, with its session renewal skipped), /api/db selects,
//     chat history and "Download my data" (GET only);
//   - the app shows a banner (src/components/MaintenanceBanner.tsx), which
//     reads GET /api/maintenance.
// Optional MAINTENANCE_MESSAGE overrides the banner text.

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

export const DEFAULT_MAINTENANCE_MESSAGE =
  'Womanie is moving to a new home for a few minutes. You can look at your data, but nothing can be saved right now. Please try again shortly.';

// Routes that stay open in maintenance. Each one is checked not to write.
// 'db' is only open for operation === 'select' (see isAllowedInMaintenance).
const READ_ONLY_ROUTES = new Set([
  'maintenance',      // the banner's status check
  'auth/me',          // session check; renewal is skipped while ON
  'research/library', // static evidence notes, no database
  'push/config',      // public VAPID key, no database
]);

// Routes open for GET only (their GET is a pure read; POST/DELETE write).
// Not docs/file: a doctor opening a file writes chart_access_log, and that
// audit row must not be lost, so documents can't be opened while ON.
const GET_ONLY_ROUTES = new Set([
  'chat/messages', // her chat history
  'me/export',     // "Download my data"
]);

export function isMaintenanceOn(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.MAINTENANCE_MODE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export function maintenanceMessage(env: Record<string, string | undefined> = process.env): string {
  const m = (env.MAINTENANCE_MESSAGE ?? '').trim();
  return m || DEFAULT_MAINTENANCE_MESSAGE;
}

export function isAllowedInMaintenance(route: string, req: Pick<VercelRequest, 'method' | 'body'>): boolean {
  if (req.method === 'OPTIONS') return true;
  if (READ_ONLY_ROUTES.has(route)) return true;
  if (GET_ONLY_ROUTES.has(route) && (req.method === 'GET' || req.method === 'HEAD')) return true;
  if (route === 'db') {
    const body = req.body as { operation?: unknown } | undefined;
    return !!body && typeof body === 'object' && body.operation === 'select';
  }
  return false;
}

export function sendMaintenance(res: VercelResponse, env: Record<string, string | undefined> = process.env) {
  res.setHeader('Retry-After', '600');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({ error: maintenanceMessage(env), maintenance: true });
}

// True (and the 503 already sent) when the request must be refused.
export function blockIfMaintenance(
  route: string,
  req: VercelRequest,
  res: VercelResponse,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!isMaintenanceOn(env) || isAllowedInMaintenance(route, req)) return false;
  sendMaintenance(res, env);
  return true;
}

// For the standalone functions (upload, analyze-document, ai-doctor-chat,
// summary/*), which do not pass through api/router.ts.
export function withMaintenance(route: string, handler: Handler): Handler {
  return (req, res) => {
    if (blockIfMaintenance(route, req, res)) return;
    return handler(req, res);
  };
}
