import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error - plain .mjs script, no type declarations
import { compareSnapshots, fixtureSnapshot, tamper, describeHost, formatReport } from './db-verify-copy.mjs';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/db-verify-fixture.json'), 'utf8'));
const clone = () => structuredClone(fixture);

describe('db-verify-copy (fixture, no database)', () => {
  it('passes an exact copy', () => {
    const r = compareSnapshots(fixtureSnapshot(fixture), fixtureSnapshot(clone()));
    expect(r.ok).toBe(true);
    expect(formatReport(r)).toContain('RESULT: PASS');
  });

  it('passes regardless of row order (physical order changes after a restore)', () => {
    const c = clone();
    c.tables.period_tracking.rows.reverse();
    expect(compareSnapshots(fixtureSnapshot(fixture), fixtureSnapshot(c)).ok).toBe(true);
  });

  it('catches a lost row, a changed user_id and an edited value', () => {
    const r = compareSnapshots(fixtureSnapshot(fixture), fixtureSnapshot(tamper(fixture)));
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/row count 2 -> 1/);
    expect(r.rows.filter((x: { status: string }) => x.status === 'FAIL').length).toBeGreaterThanOrEqual(3);
  });

  it('catches a changed id alone (same row count)', () => {
    const c = clone();
    c.tables.auth_users.rows[1].id = '99999999-9999-4999-8999-999999999999';
    const r = compareSnapshots(fixtureSnapshot(fixture), fixtureSnapshot(c));
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('table auth_users: checksum differs');
  });

  it('catches a missing table, a missing column, a lagging sequence and a missing extension', () => {
    const c = clone();
    delete c.tables.medications;
    c.tables.auth_users.columns = c.tables.auth_users.columns.filter((x: string) => !x.startsWith('created_at'));
    c.sequences.rate_limit_counters_id_seq = '3';
    c.extensions = ['plpgsql'];
    const p = compareSnapshots(fixtureSnapshot(fixture), fixtureSnapshot(c)).problems.join('\n');
    expect(p).toMatch(/medications: MISSING/);
    expect(p).toMatch(/auth_users: columns differ/);
    expect(p).toMatch(/sequence rate_limit_counters_id_seq: target 3 is behind/);
    expect(p).toMatch(/extension uuid-ossp: MISSING/);
  });

  it('prints only the region, never credentials', () => {
    const d = describeHost('postgresql://neondb_owner:s3cret@ep-x-y.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require');
    expect(d).toBe('Neon eu-central-1');
    expect(d).not.toContain('s3cret');
    expect(describeHost('postgresql://u:p@ep-x-pooler.c-5.us-east-1.aws.neon.tech/db')).toMatch(/POOLED/);
  });
});
