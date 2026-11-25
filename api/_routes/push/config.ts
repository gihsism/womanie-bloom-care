import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withSentry } from '../../_lib/sentry.js';
import { vapidConfig } from '../../_lib/push-send.js';

// Tells the app whether phone notifications are available and hands it the
// PUBLIC VAPID key it needs to subscribe. Off (enabled: false) until
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are set in Vercel.

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const cfg = vapidConfig();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(cfg ? { enabled: true, publicKey: cfg.publicKey } : { enabled: false });
}

export default withSentry(handler);
