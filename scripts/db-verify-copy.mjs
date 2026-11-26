#!/usr/bin/env node
// Proves a database copy is complete and unchanged: for every table it
// compares the column list, the row count and a checksum over every row,
// plus constraints/indexes per table, sequences and extensions.
// Written for the EU region move (docs/eu-region-migration.md).
//
// READ-ONLY on both databases: every query runs inside
// BEGIN TRANSACTION READ ONLY ... ROLLBACK, on a session that also has
// default_transaction_read_only=on, and the script only issues SELECTs.
//
// Usage (connection strings come from env vars only, never the command
// line, so they do not end up in shell history or process lists):
//   read -rs SOURCE_DATABASE_URL && export SOURCE_DATABASE_URL   # paste, Enter
//   read -rs TARGET_DATABASE_URL && export TARGET_DATABASE_URL   # paste, Enter
//   node scripts/db-verify-copy.mjs [--json report.json] [--schema public]
//
//   node scripts/db-verify-copy.mjs --dry-run
//     runs against the local fixture scripts/fixtures/db-verify-fixture.json
//     (no database, no network): an exact copy must PASS and a tampered copy
//     (lost row, changed user_id, edited value) must FAIL.
//
// Exit code: 0 = identical, 1 = differences found, 2 = could not run.
// Never prints connection strings or passwords; only the host's region tag.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------- compare

/**
 * snapshot shape (both live and fixture):
 * { tables: { [name]: { columns: string[] ("name:type"), rows: number,
 *                       checksum: string, constraints: string[], indexes: number } },
 *   sequences: { [name]: string|null }, extensions: string[] }
 */
export function compareSnapshots(source, target) {
  const problems = [];
  const rows = [];
  const srcTables = Object.keys(source.tables).sort();
  const tgtTables = new Set(Object.keys(target.tables));

  for (const name of srcTables) {
    const s = source.tables[name];
    const t = target.tables[name];
    if (!t) {
      problems.push(`table ${name}: MISSING in target`);
      rows.push({ table: name, source_rows: s.rows, target_rows: '-', columns: '-', checksum: '-', status: 'MISSING' });
      continue;
    }
    const issues = [];
    if (s.columns.join(',') !== t.columns.join(',')) issues.push('columns differ');
    if (s.rows !== t.rows) issues.push(`row count ${s.rows} -> ${t.rows}`);
    if (s.checksum !== t.checksum) issues.push('checksum differs');
    if ((s.constraints || []).join(',') !== (t.constraints || []).join(',')) issues.push('constraints differ');
    if ((s.indexes ?? 0) !== (t.indexes ?? 0)) issues.push(`indexes ${s.indexes} -> ${t.indexes}`);
    for (const i of issues) problems.push(`table ${name}: ${i}`);
    rows.push({
      table: name,
      source_rows: s.rows,
      target_rows: t.rows,
      columns: s.columns.join(',') === t.columns.join(',') ? 'same' : 'DIFF',
      checksum: s.checksum === t.checksum ? 'same' : 'DIFF',
      status: issues.length ? 'FAIL' : 'OK',
    });
  }
  for (const name of [...tgtTables].sort()) {
    if (!(name in source.tables)) problems.push(`table ${name}: only in target (unexpected)`);
  }

  for (const [seq, val] of Object.entries(source.sequences || {})) {
    const tv = (target.sequences || {})[seq];
    if (tv === undefined) problems.push(`sequence ${seq}: MISSING in target`);
    else if (val !== null && (tv === null || BigInt(tv) < BigInt(val))) {
      problems.push(`sequence ${seq}: target ${tv} is behind source ${val} (new rows would reuse ids)`);
    }
  }
  const missingExt = (source.extensions || []).filter((e) => !(target.extensions || []).includes(e));
  for (const e of missingExt) problems.push(`extension ${e}: MISSING in target`);

  return { ok: problems.length === 0, problems, rows };
}

export function formatReport(result) {
  const head = ['table', 'source_rows', 'target_rows', 'columns', 'checksum', 'status'];
  const widths = head.map((h) => Math.max(h.length, ...result.rows.map((r) => String(r[h]).length)));
  const line = (vals) => vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  const out = [line(head), line(widths.map((w) => '-'.repeat(w)))];
  for (const r of result.rows) out.push(line(head.map((h) => r[h])));
  const totalS = result.rows.reduce((a, r) => a + (Number(r.source_rows) || 0), 0);
  const totalT = result.rows.reduce((a, r) => a + (Number(r.target_rows) || 0), 0);
  out.push('', `tables: ${result.rows.length}   rows: source ${totalS}, target ${totalT}`);
  if (result.ok) out.push('RESULT: PASS - the target is an exact copy of the source.');
  else out.push(`RESULT: FAIL - ${result.problems.length} difference(s):`, ...result.problems.map((p) => `  - ${p}`));
  return out.join('\n');
}

// ---------------------------------------------------------------- fixture

// The same row-checksum idea as the SQL below, done in JS for the fixture:
// md5 per row over a canonical text, md5 of the sorted row hashes.
export function fixtureSnapshot(db) {
  const tables = {};
  for (const [name, t] of Object.entries(db.tables)) {
    const cols = [...t.columns].sort((a, b) => a.split(':')[0].localeCompare(b.split(':')[0]));
    const names = cols.map((c) => c.split(':')[0]);
    const hashes = t.rows
      .map((r) => createHash('md5').update(JSON.stringify(names.map((n) => r[n] ?? null))).digest('hex'))
      .sort();
    tables[name] = {
      columns: cols,
      rows: t.rows.length,
      checksum: createHash('md5').update(hashes.join('')).digest('hex'),
      constraints: [...(t.constraints || [])].sort(),
      indexes: t.indexes ?? 0,
    };
  }
  return { tables, sequences: db.sequences || {}, extensions: [...(db.extensions || [])].sort() };
}

export function tamper(db) {
  const copy = structuredClone(db);
  const names = Object.keys(copy.tables).filter((n) => copy.tables[n].rows.length > 0);
  // 1) lose the last row of the first table, 2) change a user_id, 3) edit a value
  copy.tables[names[0]].rows.pop();
  const withUser = names.find((n) => copy.tables[n].rows[0] && 'user_id' in copy.tables[n].rows[0]);
  if (withUser) copy.tables[withUser].rows[0].user_id = '00000000-0000-0000-0000-000000000000';
  const last = copy.tables[names[names.length - 1]];
  const col = last.columns.map((c) => c.split(':')[0]).find((c) => c !== 'id');
  if (col) last.rows[0][col] = `${last.rows[0][col]}-edited`;
  return copy;
}

function dryRun() {
  const path = fileURLToPath(new URL('./fixtures/db-verify-fixture.json', import.meta.url));
  const fixture = JSON.parse(readFileSync(path, 'utf8'));
  const src = fixtureSnapshot(fixture);
  console.log('DRY RUN against local fixture (no database is contacted)\n');
  console.log('== Case 1: exact copy (expected PASS) ==');
  const a = compareSnapshots(src, fixtureSnapshot(structuredClone(fixture)));
  console.log(formatReport(a), '\n');
  console.log('== Case 2: tampered copy - one row lost, one user_id changed, one value edited (expected FAIL) ==');
  const b = compareSnapshots(src, fixtureSnapshot(tamper(fixture)));
  console.log(formatReport(b), '\n');
  const good = a.ok && !b.ok;
  console.log(good ? 'DRY RUN OK: the verifier passes an exact copy and catches a damaged one.' : 'DRY RUN BROKEN: the verifier did not behave as expected.');
  return good ? 0 : 1;
}

// ---------------------------------------------------------------- live (Postgres)

export function describeHost(url) {
  try {
    const host = new URL(url).hostname;
    const region = host.match(/\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/)?.[1];
    return `${region ? `Neon ${region}` : 'host'}${host.includes('-pooler') ? ' (POOLED - use the direct connection string)' : ''}`;
  } catch {
    return 'unparseable connection string';
  }
}

const SESSION_SETTINGS = [
  "SET LOCAL TimeZone = 'UTC'",
  "SET LOCAL DateStyle = 'ISO, YMD'",
  "SET LOCAL IntervalStyle = 'postgres'",
  'SET LOCAL extra_float_digits = 3',
  "SET LOCAL bytea_output = 'hex'",
];

const qi = (name) => '"' + String(name).replace(/"/g, '""') + '"';

async function liveSnapshot(url, schema) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url, application_name: 'db-verify-copy (read-only)' });
  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const s of SESSION_SETTINGS) await client.query(s);

    const tablesRes = await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind IN ('r','p') ORDER BY c.relname`, [schema]);
    const tables = {};
    for (const { relname } of tablesRes.rows) {
      const colsRes = await client.query(
        `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attname`, [schema, relname]);
      const names = colsRes.rows.map((r) => r.attname);
      const rowExpr = names.length ? `ROW(${names.map(qi).join(', ')})::text` : `''`;
      const sumRes = await client.query(
        `SELECT count(*)::bigint AS n, md5(coalesce(string_agg(h, '' ORDER BY h), '')) AS checksum
         FROM (SELECT md5(${rowExpr}) AS h FROM ${qi(schema)}.${qi(relname)}) s`);
      const conRes = await client.query(
        `SELECT con.contype::text || ':' || pg_get_constraintdef(con.oid) AS d
         FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2 ORDER BY 1`, [schema, relname]);
      const idxRes = await client.query(
        `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`, [schema, relname]);
      tables[relname] = {
        columns: colsRes.rows.map((r) => `${r.attname}:${r.type}`),
        rows: Number(sumRes.rows[0].n),
        checksum: sumRes.rows[0].checksum,
        constraints: conRes.rows.map((r) => r.d),
        indexes: idxRes.rows[0].n,
      };
    }
    const seqRes = await client.query(
      `SELECT sequencename AS name, last_value::text AS v FROM pg_sequences WHERE schemaname = $1 ORDER BY 1`, [schema]);
    const sequences = Object.fromEntries(seqRes.rows.map((r) => [r.name, r.v]));
    const extRes = await client.query(`SELECT extname FROM pg_extension ORDER BY 1`);
    return { tables, sequences, extensions: extRes.rows.map((r) => r.extname) };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}

async function main(argv) {
  if (argv.includes('--dry-run')) return dryRun();
  const schema = argv.includes('--schema') ? argv[argv.indexOf('--schema') + 1] : 'public';
  const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
  const src = process.env.SOURCE_DATABASE_URL;
  const tgt = process.env.TARGET_DATABASE_URL;
  if (!src || !tgt) {
    console.error('Set SOURCE_DATABASE_URL (old database) and TARGET_DATABASE_URL (new database) first. See the header of this file.');
    return 2;
  }
  if (src === tgt) {
    console.error('SOURCE and TARGET are the same connection string - refusing (that would always pass).');
    return 2;
  }
  console.log(`source: ${describeHost(src)}\ntarget: ${describeHost(tgt)}\nschema: ${schema}   mode: read-only\n`);
  const [a, b] = await Promise.all([liveSnapshot(src, schema), liveSnapshot(tgt, schema)]);
  const result = compareSnapshots(a, b);
  console.log(formatReport(result));
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ at: new Date().toISOString(), schema, source: describeHost(src), target: describeHost(tgt), ...result }, null, 2));
    console.log(`\nreport written to ${jsonOut} (no credentials in it)`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      // pg error messages do not contain the password; still, print only the message.
      console.error('Could not run:', e?.message ?? e);
      process.exit(2);
    });
}
