import { useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';

// Personal data that older app versions kept only in this browser
// (localStorage) now also lives in the user's account (table
// user_app_data, migration 011), so it follows her to a new phone.
//
// localStorage stays the fast local copy: components keep reading and
// writing it as before, and call pushAccountData() after a write.
//
// Rules (hard, see tests):
// - Copy-up of existing device data happens ONLY when the account has no
//   value for that item yet, and uses a plain insert, so it can never
//   replace what is already in the account.
// - Nothing is ever deleted, on the server or on the device.
// - When the account already has a value and the device holds a
//   different one, the device value is kept in a backup key before the
//   local copy is refreshed from the account.
// - If the account can't be reached, nothing changes and the device data
//   keeps working exactly as before.

export type AccountDataFormat = 'json' | 'text';

interface AccountItem {
  /** localStorage key with `{uid}` in place of the user id. */
  template: string;
  format: AccountDataFormat;
}

// Every device-only key that holds the user's own data. Per-device UI
// state (dismissed banners, last login method, carousel positions,
// running timers) is deliberately NOT listed.
export const ACCOUNT_ITEMS: AccountItem[] = [
  // Onboarding answers: date of birth, height, weight, blood type.
  { template: 'womanie_basic_info_{uid}', format: 'json' },
  // Notification choices from Settings.
  { template: 'womanie_notification_prefs_{uid}', format: 'json' },
  { template: 'womanie_emergency_contacts_{uid}', format: 'json' },
  // Pregnancy.
  { template: 'womanie_hospital_bag_{uid}', format: 'json' },
  { template: 'womanie_preg_weight_setup_{uid}', format: 'json' },
  { template: 'womanie_preg_weight_log_{uid}', format: 'json' },
  { template: 'womanie_maternal_weight_{uid}', format: 'json' },
  { template: 'womanie_bp_log_{uid}', format: 'json' },
  { template: 'womanie_preg_vaccinations_{uid}', format: 'json' },
  // Check-ups and scans marked done (lib/pregnancySchedule.ts).
  { template: 'womanie_preg_checkups_{uid}', format: 'json' },
  { template: 'womanie_beta_hcg_{uid}', format: 'json' },
  { template: 'womanie_screenings_{uid}', format: 'json' },
  { template: 'womanie_visit_prep_checked_{uid}', format: 'json' },
  // Postpartum.
  { template: 'womanie_epds_history_{uid}', format: 'json' },
  { template: 'postpartum:{uid}:milestones', format: 'json' },
  { template: 'postpartum:{uid}:ppd-checkin', format: 'text' },
  { template: 'postpartum:{uid}:pelvic-floor', format: 'json' },
  // Weekly recovery check-in, first 12 weeks (src/lib/postpartumRecovery.ts).
  { template: 'postpartum:{uid}:recovery-checkins', format: 'json' },
  // Contraception, pre-menstrual, menopause.
  { template: 'contraception:{uid}:method', format: 'json' },
  { template: 'contraception:{uid}:sideEffects', format: 'json' },
  { template: 'contraception:{uid}:reminderTime', format: 'json' },
  { template: 'contraception:{uid}:packStartDate', format: 'json' },
  // Combined / mini-pill type for the missed-pill steps (lib/missedPill.ts).
  { template: 'contraception:{uid}:pillType', format: 'json' },
  // Dates for the other methods: IUD / implant / injection / ring / patch (lib/contraceptionSchedule.ts).
  { template: 'contraception:{uid}:methodDates', format: 'json' },
  { template: 'pre-menstrual:{uid}:checkedItems', format: 'json' },
  { template: 'menopause:{uid}:meno:trackedSymptoms', format: 'json' },
  { template: 'menopause:{uid}:post:trackedSymptoms', format: 'json' },
];

/** Name of the item in the account: the template without the user id. */
export function accountKeyFor(template: string): string {
  return template
    .replace(/^womanie_/, '')
    .replace(/_\{uid\}$/, '')
    .replace(/:\{uid\}:/, ':')
    .replace(/\{uid\}/, '');
}

export function localKeyFor(template: string, userId: string): string {
  return template.replace('{uid}', userId);
}

export const backupKeyFor = (localKey: string) => `${localKey}__before_account_sync`;
const unsyncedKeyFor = (localKey: string) => `${localKey}__unsynced`;

// ── Value conversion ────────────────────────────────────────────────

/** Local string -> value stored in the account, or undefined if empty/unreadable. */
export function toAccountValue(raw: string | null, format: AccountDataFormat): unknown {
  if (raw === null || raw === '') return undefined;
  if (format === 'text') return raw;
  try {
    const v = JSON.parse(raw);
    return v === null ? undefined : v;
  } catch {
    return undefined;
  }
}

/** Account value -> local string. */
export function toLocalString(value: unknown, format: AccountDataFormat): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (format === 'text') return typeof value === 'string' ? value : JSON.stringify(value);
  // The Neon driver hands JSONB back already parsed (checked live), so a
  // string here is a JSON string value such as "pill" or "21:00".
  return JSON.stringify(value);
}

// ── Sync core (pure apart from injected deps, unit-tested) ─────────

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AccountBackend {
  /** All of this user's saved items, or ok:false if the account could not be read. */
  readAll(): Promise<{ ok: boolean; rows: Array<{ key: string; value: unknown }> }>;
  /** Plain insert. Must fail (not overwrite) if the item already exists. */
  insertIfAbsent(key: string, value: unknown): Promise<boolean>;
  /** Save the user's own edit (insert or update). */
  save(key: string, value: unknown): Promise<boolean>;
}

export interface SyncResult {
  ok: boolean;
  copiedUp: string[];   // local keys copied into an empty account slot
  refreshed: string[];  // local keys updated from the account
  pushed: string[];     // local edits that had failed to save earlier
}

function safeGet(store: KeyValueStore, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}
function safeSet(store: KeyValueStore, key: string, value: string) {
  try { store.setItem(key, value); } catch { /* quota / private mode */ }
}

export async function syncAccountItems(
  userId: string,
  items: AccountItem[],
  store: KeyValueStore,
  backend: AccountBackend,
): Promise<SyncResult> {
  const result: SyncResult = { ok: false, copiedUp: [], refreshed: [], pushed: [] };
  if (!userId) return result;
  const server = await backend.readAll().catch(() => ({ ok: false, rows: [] }));
  if (!server.ok) return result; // Account unreachable: change nothing.
  result.ok = true;
  const byKey = new Map<string, unknown>();
  for (const r of server.rows) byKey.set(r.key, r.value);

  for (const item of items) {
    const key = accountKeyFor(item.template);
    const localKey = localKeyFor(item.template, userId);
    const localRaw = safeGet(store, localKey);
    const localValue = toAccountValue(localRaw, item.format);
    const serverValue = byKey.has(key) ? byKey.get(key) : undefined;
    const serverHas = serverValue !== undefined && serverValue !== null;

    if (!serverHas) {
      // Account empty for this item: copy the device value up, never replace.
      if (localValue !== undefined && await backend.insertIfAbsent(key, localValue).catch(() => false)) {
        result.copiedUp.push(localKey);
        clearUnsynced(store, localKey);
      }
      continue;
    }

    // An edit made on this device after a successful sync, which then
    // failed to reach the account: send it now.
    if (safeGet(store, unsyncedKeyFor(localKey)) === '1' && localValue !== undefined) {
      if (await backend.save(key, localValue).catch(() => false)) {
        clearUnsynced(store, localKey);
        result.pushed.push(localKey);
      }
      continue;
    }

    const serverRaw = toLocalString(serverValue, item.format);
    if (serverRaw === undefined || serverRaw === localRaw) continue;
    if (localValue !== undefined && sameValue(localValue, serverValue)) continue;
    // Keep the device's own copy before refreshing it (first one wins, so
    // the pre-update data is never overwritten by a later refresh).
    if (localRaw !== null && localRaw !== '' && safeGet(store, backupKeyFor(localKey)) === null) {
      safeSet(store, backupKeyFor(localKey), localRaw);
    }
    safeSet(store, localKey, serverRaw);
    result.refreshed.push(localKey);
  }
  return result;
}

function clearUnsynced(store: KeyValueStore, localKey: string) {
  if (safeGet(store, unsyncedKeyFor(localKey)) === '1') safeSet(store, unsyncedKeyFor(localKey), '');
}

function sameValue(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

// ── App wiring ──────────────────────────────────────────────────────

const dbBackend: AccountBackend = {
  async readAll() {
    const { data, error } = await db.from('user_app_data').select('key, value');
    if (error || !Array.isArray(data)) return { ok: false, rows: [] };
    return { ok: true, rows: data as Array<{ key: string; value: unknown }> };
  },
  async insertIfAbsent(key, value) {
    const { error } = await db.from('user_app_data').insert({ key, value: JSON.stringify(value) });
    return !error;
  },
  async save(key, value) {
    const { error } = await db.from('user_app_data').upsert(
      { key, value: JSON.stringify(value), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' },
    );
    return !error;
  },
};

const syncs = new Map<string, Promise<SyncResult>>();
type Listener = (changedLocalKeys: Set<string>) => void;
const listeners = new Set<Listener>();

/** Runs once per user per page load; later calls get the same promise. */
export function syncAccountData(userId: string): Promise<SyncResult> {
  if (!userId) return Promise.resolve({ ok: false, copiedUp: [], refreshed: [], pushed: [] });
  let p = syncs.get(userId);
  if (!p) {
    p = syncAccountItems(userId, ACCOUNT_ITEMS, window.localStorage, dbBackend)
      .catch(() => ({ ok: false, copiedUp: [], refreshed: [], pushed: [] }))
      .then(r => {
        if (r.refreshed.length) {
          const changed = new Set(r.refreshed);
          for (const l of listeners) { try { l(changed); } catch { /* keep going */ } }
        }
        return r;
      });
    syncs.set(userId, p);
  }
  return p;
}

/**
 * Call cb when the account sync replaced one of these local keys with the
 * account's value, so the component can re-read localStorage. Returns an
 * unsubscribe function (usable as a useEffect cleanup).
 */
export function onAccountDataRefresh(localKeys: string | string[], cb: () => void): () => void {
  const wanted = new Set(Array.isArray(localKeys) ? localKeys : [localKeys]);
  const l: Listener = changed => { for (const k of wanted) if (changed.has(k)) { cb(); return; } };
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Save the CURRENT local value of a key to the account. Call right after
 * writing it to localStorage. Waits for the first sync of this page load
 * (so a default value written on mount can't replace the account's data:
 * by then the local copy holds the account value), then debounces.
 */
export function pushAccountData(userId: string | undefined | null, localKey: string): void {
  if (!userId || typeof window === 'undefined') return;
  const item = ACCOUNT_ITEMS.find(i => localKeyFor(i.template, userId) === localKey);
  if (!item) return;
  const prev = pending.get(localKey);
  if (prev) clearTimeout(prev);
  pending.set(localKey, setTimeout(() => {
    pending.delete(localKey);
    void (async () => {
      const synced = await syncAccountData(userId);
      if (!synced.ok) return; // Account unreachable: the device copy stays as is.
      const value = toAccountValue(safeGet(window.localStorage, localKey), item.format);
      if (value === undefined) return;
      const ok = await dbBackend.save(accountKeyFor(item.template), value).catch(() => false);
      if (ok) clearUnsynced(window.localStorage, localKey);
      else safeSet(window.localStorage, unsyncedKeyFor(localKey), '1');
    })();
  }, 400));
}

/**
 * A number that goes up whenever the account sync refreshed one of these
 * local keys. Add it to the dependencies of the effect that reads them
 * from localStorage, so the screen shows the account's data.
 */
export function useAccountDataVersion(localKeys: Array<string | null | undefined>): number {
  const [version, setVersion] = useState(0);
  const joined = localKeys.filter(Boolean).join('\n');
  useEffect(() => {
    if (!joined) return;
    return onAccountDataRefresh(joined.split('\n'), () => setVersion(v => v + 1));
  }, [joined]);
  return version;
}
