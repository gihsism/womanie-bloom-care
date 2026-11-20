import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_ITEMS,
  accountKeyFor,
  backupKeyFor,
  syncAccountItems,
  toAccountValue,
  toLocalString,
  type AccountBackend,
  type KeyValueStore,
} from './account-data';

const UID = 'user_abc';

function memoryStore(init: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: k => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

// A fake account that behaves like the user_app_data table: insert fails
// when the key exists (unique constraint), save replaces.
function fakeAccount(init: Record<string, unknown> = {}, opts: { readFails?: boolean; insertFails?: boolean } = {}) {
  const rows = new Map(Object.entries(init));
  const calls = { insert: [] as string[], save: [] as string[] };
  const backend: AccountBackend = {
    async readAll() {
      if (opts.readFails) return { ok: false, rows: [] };
      return { ok: true, rows: Array.from(rows, ([key, value]) => ({ key, value })) };
    },
    async insertIfAbsent(key, value) {
      calls.insert.push(key);
      if (opts.insertFails || rows.has(key)) return false;
      rows.set(key, value);
      return true;
    },
    async save(key, value) {
      calls.save.push(key);
      rows.set(key, value);
      return true;
    },
  };
  return { backend, rows, calls };
}

const BAG = { template: 'womanie_hospital_bag_{uid}', format: 'json' as const };
const BAG_LOCAL = `womanie_hospital_bag_${UID}`;
const BIRTHDAY = { template: 'womanie_basic_info_{uid}', format: 'json' as const };
const BASIC_LOCAL = `womanie_basic_info_${UID}`;
const PPD = { template: 'postpartum:{uid}:ppd-checkin', format: 'text' as const };
const PPD_LOCAL = `postpartum:${UID}:ppd-checkin`;

describe('account keys', () => {
  it('names items without the user id', () => {
    expect(accountKeyFor('womanie_hospital_bag_{uid}')).toBe('hospital_bag');
    expect(accountKeyFor('contraception:{uid}:method')).toBe('contraception:method');
    expect(accountKeyFor('menopause:{uid}:meno:trackedSymptoms')).toBe('menopause:meno:trackedSymptoms');
  });

  it('gives every registered item a unique account key', () => {
    const keys = ACCOUNT_ITEMS.map(i => accountKeyFor(i.template));
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of ACCOUNT_ITEMS) expect(i.template).toContain('{uid}');
  });

  it('does not sync per-device UI state', () => {
    const templates = ACCOUNT_ITEMS.map(i => i.template).join(' ');
    for (const ui of ['dismissed', 'last_method', 'last_email', 'install', 'factIndex', 'mythIndex', 'active', 'hidden', 'chat_model']) {
      expect(templates).not.toContain(ui);
    }
  });
});

describe('value conversion', () => {
  it('round-trips json and text values', () => {
    expect(toAccountValue('["a","b"]', 'json')).toEqual(['a', 'b']);
    expect(toAccountValue('2026-11-01', 'text')).toBe('2026-11-01');
    expect(toAccountValue(null, 'json')).toBeUndefined();
    expect(toAccountValue('not json', 'json')).toBeUndefined();
    expect(toLocalString(['a', 'b'], 'json')).toBe('["a","b"]');
    expect(toLocalString('2026-11-01', 'text')).toBe('2026-11-01');
    // JSON string values (contraception method, reminder time) stay strings.
    expect(toLocalString('pill', 'json')).toBe('"pill"');
    expect(toLocalString('123', 'json')).toBe('"123"');
    expect(toAccountValue(toLocalString('21:00', 'json')!, 'json')).toBe('21:00');
  });
});

describe('syncAccountItems: copy-up', () => {
  it('copies device data up when the account has no value yet', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["passport","charger"]' });
    const acct = fakeAccount();
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.ok).toBe(true);
    expect(r.copiedUp).toEqual([BAG_LOCAL]);
    expect(acct.rows.get('hospital_bag')).toEqual(['passport', 'charger']);
    // The device copy is kept.
    expect(store.getItem(BAG_LOCAL)).toBe('["passport","charger"]');
  });

  it('never overwrites a value the account already has', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["old-device-item"]' });
    const acct = fakeAccount({ hospital_bag: ['account-item'] });
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.copiedUp).toEqual([]);
    expect(acct.calls.insert).toEqual([]);
    expect(acct.calls.save).toEqual([]);
    expect(acct.rows.get('hospital_bag')).toEqual(['account-item']);
  });

  it('keeps the device value in a backup before refreshing it from the account', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["old-device-item"]' });
    const acct = fakeAccount({ hospital_bag: ['account-item'] });
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.refreshed).toEqual([BAG_LOCAL]);
    expect(store.getItem(BAG_LOCAL)).toBe('["account-item"]');
    expect(store.getItem(backupKeyFor(BAG_LOCAL))).toBe('["old-device-item"]');
  });

  it('never replaces an existing backup', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["second"]', [backupKeyFor(BAG_LOCAL)]: '["first"]' });
    const acct = fakeAccount({ hospital_bag: ['account-item'] });
    await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(store.getItem(backupKeyFor(BAG_LOCAL))).toBe('["first"]');
  });

  it('fills an empty device from the account (new phone)', async () => {
    const store = memoryStore();
    const acct = fakeAccount({ basic_info: { dateOfBirth: '1990-04-02', heightCm: 168 } });
    const r = await syncAccountItems(UID, [BIRTHDAY], store, acct.backend);
    expect(r.refreshed).toEqual([BASIC_LOCAL]);
    expect(JSON.parse(store.getItem(BASIC_LOCAL)!)).toEqual({ dateOfBirth: '1990-04-02', heightCm: 168 });
    expect(store.getItem(backupKeyFor(BASIC_LOCAL))).toBeNull();
    expect(acct.calls.insert).toEqual([]);
  });

  it('does nothing when device and account already agree', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["a"]' });
    const acct = fakeAccount({ hospital_bag: ['a'] });
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r).toMatchObject({ copiedUp: [], refreshed: [], pushed: [] });
    expect(store.data.size).toBe(1);
  });

  it('changes nothing anywhere when the account cannot be read', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["a"]' });
    const acct = fakeAccount({}, { readFails: true });
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.ok).toBe(false);
    expect(acct.calls.insert).toEqual([]);
    expect(acct.calls.save).toEqual([]);
    expect(store.getItem(BAG_LOCAL)).toBe('["a"]');
  });

  it('keeps the device copy and retries later when the copy-up fails', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["a"]' });
    const acct = fakeAccount({}, { insertFails: true });
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.copiedUp).toEqual([]);
    expect(store.getItem(BAG_LOCAL)).toBe('["a"]');
    const ok = fakeAccount();
    const r2 = await syncAccountItems(UID, [BAG], store, ok.backend);
    expect(r2.copiedUp).toEqual([BAG_LOCAL]);
  });

  it('uses insert-only for copy-up, so a value that appears meanwhile is not replaced', async () => {
    // Account looked empty when read, but another device wrote first.
    const store = memoryStore({ [BAG_LOCAL]: '["this-device"]' });
    const acct = fakeAccount();
    const realRead = acct.backend.readAll;
    acct.backend.readAll = async () => {
      const res = await realRead();
      acct.rows.set('hospital_bag', ['other-device']);
      return res;
    };
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.copiedUp).toEqual([]);
    expect(acct.rows.get('hospital_bag')).toEqual(['other-device']);
    expect(acct.calls.save).toEqual([]);
  });

  it('skips empty or unreadable device values', async () => {
    const store = memoryStore({ [BAG_LOCAL]: 'corrupt{', [BASIC_LOCAL]: 'null' });
    const acct = fakeAccount();
    const r = await syncAccountItems(UID, [BAG, BIRTHDAY], store, acct.backend);
    expect(r.copiedUp).toEqual([]);
    expect(acct.calls.insert).toEqual([]);
    expect(store.getItem(BAG_LOCAL)).toBe('corrupt{');
  });

  it('copies plain-text values as they are', async () => {
    const store = memoryStore({ [PPD_LOCAL]: '2026-11-02' });
    const acct = fakeAccount();
    await syncAccountItems(UID, [PPD], store, acct.backend);
    expect(acct.rows.get('postpartum:ppd-checkin')).toBe('2026-11-02');
  });

  it("never touches another user's device data", async () => {
    const store = memoryStore({ 'womanie_hospital_bag_someone_else': '["x"]' });
    const acct = fakeAccount();
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.copiedUp).toEqual([]);
    expect(acct.calls.insert).toEqual([]);
  });

  it('sends an edit that failed to save earlier instead of discarding it', async () => {
    const store = memoryStore({ [BAG_LOCAL]: '["edited-offline"]', [`${BAG_LOCAL}__unsynced`]: '1' });
    const acct = fakeAccount({ hospital_bag: ['before-edit'] });
    const r = await syncAccountItems(UID, [BAG], store, acct.backend);
    expect(r.pushed).toEqual([BAG_LOCAL]);
    expect(acct.rows.get('hospital_bag')).toEqual(['edited-offline']);
    expect(store.getItem(`${BAG_LOCAL}__unsynced`)).toBe('');
  });
});
