import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PRIVACY_TABLES } from './privacy-data-map';

// Data-subject-rights guard. A new table that holds data about a person
// (a user / patient / doctor id, or an email) must be covered by BOTH
// "Download my data" (me/export.ts) and "Delete my account"
// (me/delete-account.ts), or listed in api/_lib/privacy-data-map.ts with
// the reason it is not. This test scans db/migrations, so adding
// `CREATE TABLE foo (user_id TEXT ...)` without wiring it fails here.

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

// Columns that make a row "about a person".
const PERSON_COLUMN = /^\s*(user_id|patient_id|doctor_id|[a-z_]+_user_id|[a-z_]*email|created_by|uploaded_by_doctor_id)\s+TEXT/im;

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Tables created or altered by the migrations that carry a person column. */
function personalTablesFromMigrations(): Map<string, string> {
  const found = new Map<string, string>();
  for (const f of readdirSync(new URL('db/migrations/', root)).filter(n => n.endsWith('.sql'))) {
    const sql = stripComments(read(`db/migrations/${f}`));
    for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) {
      if (m[2].split('\n').some(line => PERSON_COLUMN.test(line))) found.set(m[1], f);
    }
    for (const m of sql.matchAll(/ALTER TABLE ([a-z_]+)([\s\S]*?);/gi)) {
      const cols = [...m[2].matchAll(/ADD COLUMN IF NOT EXISTS ([a-z_]+\s+TEXT)/gi)].map(c => c[1]);
      if (cols.some(c => PERSON_COLUMN.test(c))) found.set(m[1], f);
    }
  }
  return found;
}

function ownerMapTables(): string[] {
  const src = read('api/_routes/db.ts');
  const start = src.indexOf('const OWNER_COLUMN');
  const block = src.slice(start, src.indexOf('};', start));
  return [...block.matchAll(/^\s+([a-z_]+):/gm)].map(m => m[1]);
}

describe('privacy coverage: export + deletion cover every personal table', () => {
  const migrations = personalTablesFromMigrations();

  it('the migration scan finds the known personal tables (scanner sanity)', () => {
    for (const t of ['chat_messages', 'visit_questions', 'push_subscriptions', 'push_sent_log', 'birth_plans', 'admin_audit_log', 'doctor_invites', 'chart_access_log', 'health_documents', 'consent_log']) {
      expect(migrations.has(t), t).toBe(true);
    }
    // rate_limit_counters only holds hashes: correctly not "personal" by column.
    expect(migrations.has('rate_limit_counters')).toBe(false);
  });

  it('every personal table from the migrations and /api/db is in privacy-data-map.ts', () => {
    const missing = [...new Set([...migrations.keys(), ...ownerMapTables()])].filter(t => !(t in PRIVACY_TABLES));
    expect(missing, 'add these tables to api/_lib/privacy-data-map.ts, me/export.ts and me/delete-account.ts').toEqual([]);
  });

  it('export.ts reads every table marked export: rows', () => {
    const src = read('api/_routes/me/export.ts');
    const missing = Object.entries(PRIVACY_TABLES)
      .filter(([, r]) => r.export === 'rows')
      .filter(([t]) => !new RegExp(`FROM ${t}\\b`).test(src))
      .map(([t]) => t);
    expect(missing).toEqual([]);
  });

  it('delete-account.ts deletes or pseudonymises every table as declared', () => {
    const src = read('api/_routes/me/delete-account.ts');
    const wrong = Object.entries(PRIVACY_TABLES).filter(([t, r]) => {
      if (r.erase === 'delete') return !new RegExp(`DELETE FROM ${t}\\b`).test(src);
      if (r.erase === 'pseudonymise') return !new RegExp(`UPDATE ${t}\\b`).test(src) || new RegExp(`DELETE FROM ${t}\\b`).test(src);
      return false;
    }).map(([t]) => t);
    expect(wrong).toEqual([]);
  });

  it('every exception (excluded / pseudonymised / view) states why', () => {
    const silent = Object.entries(PRIVACY_TABLES)
      .filter(([, r]) => r.export === 'excluded' || r.erase !== 'delete')
      .filter(([, r]) => !r.why || r.why.length < 15)
      .map(([t]) => t);
    expect(silent).toEqual([]);
  });

  it('docs/privacy-data-map.md mentions every table', () => {
    const doc = read('docs/privacy-data-map.md');
    const missing = Object.keys(PRIVACY_TABLES).filter(t => !doc.includes(t));
    expect(missing).toEqual([]);
  });
});
