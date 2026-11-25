import webpush from 'web-push';
import type { PushPayload, SubscriptionRow } from './push-schedule.js';

// Web Push sender (free `web-push` library, no paid provider). VAPID keys
// come from env; with any of the three missing, push is simply OFF: the
// opt-in says "not available yet" and the scheduler sends nothing.
//   VAPID_PUBLIC_KEY   VAPID_PRIVATE_KEY   VAPID_SUBJECT (mailto:... or https://...)
// Generate once with:  npx web-push generate-vapid-keys

export interface VapidConfig { publicKey: string; privateKey: string; subject: string }

export function vapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export type SendResult = 'sent' | 'gone' | 'failed';

/**
 * Sends one notification to one device. 'gone' = the browser dropped the
 * subscription (404/410): the caller deletes that row.
 */
export async function sendPush(cfg: VapidConfig, sub: Pick<SubscriptionRow, 'endpoint' | 'p256dh' | 'auth'>, payload: PushPayload): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
        // A reminder that can't be delivered within 6 hours is no use.
        TTL: 6 * 60 * 60,
        urgency: 'normal',
      },
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.error('push send failed:', status ?? (err as Error)?.message);
    return 'failed';
  }
}
