// Browser side of phone reminders (Web Push). The server half lives in
// api/_routes/push/*; the service worker half in public/push-sw.js.

// bookings = doctor side: a patient booked, moved or cancelled a visit with
// her (switched in the doctor's Profile & settings, not in Me -> Reminders).
// documents = patient side: "Dr X added a document" to her Records.
// ivf_trigger = IVF trigger shot, 1 h and 10 min before; opt-in (off when
// missing, so older callers that build prefs without it keep it off).
// checkups = pregnancy and baby vaccinations, 6-week postnatal check (on
// when missing: the server reads a device saved before it existed as on).
// pill = contraceptive pill time (on when missing, like checkups).
export interface PushPrefs { medicine: boolean; pill?: boolean; period: boolean; appointment: boolean; bookings: boolean; documents: boolean; ivf_trigger?: boolean; checkups?: boolean }
export const DEFAULT_PUSH_PREFS: PushPrefs = { medicine: true, pill: true, period: true, appointment: true, bookings: true, documents: true, ivf_trigger: false, checkups: true };

export type PushSupport =
  | 'native-app'      // Capacitor iOS/Android shell: Web Push does not run there
  | 'ios-install'     // iPhone/iPad Safari tab: needs Home Screen install (iOS 16.4+)
  | 'unsupported'     // browser without Push API
  | 'denied'          // she blocked notifications for the site
  | 'ok';

export interface PushEnv {
  isNative: boolean;
  isIOS: boolean;
  standalone: boolean;
  hasPushApi: boolean;
  permission: NotificationPermission | 'unknown';
}

/** What the opt-in can offer on this device. */
export function pushSupport(env: PushEnv): PushSupport {
  if (env.isNative) return 'native-app';
  if (env.isIOS && !env.standalone) return 'ios-install';
  if (!env.hasPushApi) return env.isIOS ? 'ios-install' : 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return 'ok';
}

export function readPushEnv(isNative: boolean): PushEnv {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent ?? '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
  let standalone = false;
  try {
    standalone = window.matchMedia('(display-mode: standalone)').matches
      || (nav as Navigator & { standalone?: boolean })?.standalone === true;
  } catch { /* no matchMedia */ }
  const hasPushApi = typeof window !== 'undefined' && !!nav && 'serviceWorker' in nav && 'PushManager' in window && 'Notification' in window;
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unknown';
  return { isNative, isIOS, standalone, hasPushApi, permission };
}

/** VAPID public key (base64url) -> bytes for pushManager.subscribe. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function localTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export async function fetchPushConfig(): Promise<{ enabled: boolean; publicKey?: string }> {
  try {
    const r = await fetch('/api/push/config');
    if (!r.ok) return { enabled: false };
    return await r.json();
  } catch {
    return { enabled: false };
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<null>(res => setTimeout(() => res(null), 8000));
  return (await Promise.race([ready, timeout])) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await registration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function save(sub: PushSubscription, prefs: PushPrefs): Promise<void> {
  const r = await fetch('/api/push/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), timezone: localTimeZone(), prefs }),
  });
  if (!r.ok) throw new Error('save failed');
}

/** Asks permission, subscribes this device and saves it to her account. */
export async function enablePush(publicKey: string, prefs: PushPrefs): Promise<'on' | 'denied' | 'failed'> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'failed';
  const reg = await registration();
  if (!reg) return 'failed';
  try {
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource }));
    await save(sub, prefs);
    return 'on';
  } catch {
    return 'failed';
  }
}

export async function updatePushPrefs(prefs: PushPrefs): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return false;
  try { await save(sub, prefs); return true; } catch { return false; }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch('/api/push/subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** Server copy of this device's opt-in (null = not subscribed for this account). */
export async function serverPushState(sub: PushSubscription): Promise<PushPrefs | null> {
  try {
    const r = await fetch(`/api/push/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.subscribed ? { ...DEFAULT_PUSH_PREFS, ...j.prefs } : null;
  } catch {
    return null;
  }
}

export async function sendTestPush(): Promise<boolean> {
  try {
    const r = await fetch('/api/push/test', { method: 'POST' });
    if (!r.ok) return false;
    const j = await r.json();
    return (j.sent ?? 0) > 0;
  } catch {
    return false;
  }
}
