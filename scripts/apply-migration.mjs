#!/usr/bin/env node
// Minimal, dependency-light migration runner. The repo had none — migrations in
// db/migrations/ were applied by hand against Neon, which is how user_roles got
// silently dropped in the Supabase→Neon move (see 003). This makes applying a
// migration a single, logged command.
//
// Usage:
//   node scripts/apply-migration.mjs db/migrations/004_llm_cache_created_at.sql
//
// Reads DATABASE_URL from the environment, falling back to .env.local. Strips
// `--` line comments, splits on top-level semicolons, and runs each statement
// in order. Intended for the simple additive DDL this project uses (ADD COLUMN
// IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS) — all
// idempotent, so re-running a migration is safe.

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* fall through */ }
  return null;
}

function splitStatements(sql) {
  // Drop `--` comments, then split on semicolons. Adequate for additive DDL;
  // do not use for statements containing semicolons inside string/function
  // bodies.
  const noComments = sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
  return noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>');
    process.exit(1);
  }
  const url = loadDatabaseUrl();
  if (!url) {
    console.error('DATABASE_URL not set and not found in .env.local');
    process.exit(1);
  }

  const sqlText = readFileSync(file, 'utf8');
  const statements = splitStatements(sqlText);
  const sql = neon(url);

  console.log(`Applying ${file} — ${statements.length} statement(s)`);
  for (const [i, stmt] of statements.entries()) {
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}… `);
    await sql.query(stmt);
    console.log('ok');
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error('\nMigration failed:', e.message || e);
  process.exit(1);
});
