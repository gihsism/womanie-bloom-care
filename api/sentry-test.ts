import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withSentry } from './_lib/sentry.js';

async function handler(_req: VercelRequest, _res: VercelResponse) {
  throw new Error('Sentry wire-up verification (safe to delete)');
}

export default withSentry(handler);
