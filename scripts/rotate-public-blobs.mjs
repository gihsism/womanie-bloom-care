#!/usr/bin/env node
// ROTATION PLAN for health documents still stored as PUBLIC Vercel blobs.
// NOT RUN. Written 2026-11-25 alongside the /api/docs/file proxy; read the
// whole header before using it.
//
// Where things stand
//   - Since the proxy shipped, no API response carries health_documents
//     .file_path and every client read goes through /api/docs/file?id=.
//     So exposure of the older public URLs has stopped going forward.
//   - What is NOT fixed by that: a public URL that already left the server
//     (old app responses, a doctor's browser history, an old data export)
//     still opens the file for anyone, forever. Rotation closes that.
//   - New uploads go private once BLOB_DOCUMENT_ACCESS=private is set and
//     the store accepts private blobs (check with --probe below first).
//
// How rotation works (additive and reversible; nothing is deleted)
//   0. --probe          put + get + delete one tiny file in the test
//                       account's folder (ux-review@womanie.test) with
//                       access 'private'. Proves the target store takes
//                       private blobs before anything else happens.
//   1. Migration        ALTER TABLE health_documents
//                         ADD COLUMN IF NOT EXISTS file_path_public_legacy TEXT;
//                       (run with scripts/apply-migration.mjs once a file
//                       for it exists; nullable, no default, app ignores it)
//   2. (default)        DRY RUN: lists how many documents would move. No writes.
//   3. --execute        For each document whose file_path is a public blob in
//                       its owner's folder:
//                         a. read it (get, store token) and write a private
//                            copy under the SAME <user_id>/ prefix with a
//                            random suffix (put access:'private', token =
//                            BLOB_PRIVATE_READ_WRITE_TOKEN if the private
//                            store is a separate store, else the main token);
//                         b. verify the copy (byte size matches);
//                         c. compare-and-swap the row:
//                              UPDATE health_documents
//                                 SET file_path_public_legacy = file_path,
//                                     file_path = <private url>
//                               WHERE id = $1 AND file_path = <old public url>
//                            so a row that changed in the meantime is skipped.
//                       One document at a time; safe to re-run (rotated rows
//                       are private URLs and are skipped).
//   4. Rollback         UPDATE health_documents SET file_path = file_path_public_legacy
//                        WHERE file_path_public_legacy IS NOT NULL;
//                       (the public blobs were never touched, so this is exact)
//   5. Only after a soak period (e.g. 30 days of /api/docs/file serving the
//      private copies without 404s) and the owner's explicit go-ahead: delete
//      the old public blobs listed in file_path_public_legacy, then null the
//      column. That step is deliberately NOT in this script.
//
// Requirements: DATABASE_URL, BLOB_READ_WRITE_TOKEN (and optionally
// BLOB_PRIVATE_READ_WRITE_TOKEN). The server proxy already reads both
// public and private blob URLs, so the app needs no change for steps 3-4.

import { neon } from '@neondatabase/serverless';
import { get, put, del } from '@vercel/blob';

const args = new Set(process.argv.slice(2));
const sql = neon(process.env.DATABASE_URL);
const READ_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const WRITE_TOKEN = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || READ_TOKEN;
if (!process.env.DATABASE_URL || !READ_TOKEN) {
  console.error('DATABASE_URL and BLOB_READ_WRITE_TOKEN are required.');
  process.exit(1);
}

const PUBLIC_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i;
function ownPathname(url, userId) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !PUBLIC_HOST.test(u.hostname)) return null;
    const p = decodeURIComponent(u.pathname).replace(/^\//, '');
    return p.startsWith(`${userId}/`) && !p.includes('../') ? p : null;
  } catch {
    return null;
  }
}

if (args.has('--probe')) {
  const [acct] = await sql.query(`SELECT id FROM auth_users WHERE email = 'ux-review@womanie.test' LIMIT 1`);
  if (!acct) { console.error('Test account not found.'); process.exit(1); }
  const b = await put(`${acct.id}/private-probe.txt`, 'probe', {
    access: 'private', addRandomSuffix: true, contentType: 'text/plain', token: WRITE_TOKEN,
  });
  try {
    const g = await get(b.url, { access: 'private', token: WRITE_TOKEN });
    const anon = await fetch(b.url);
    console.log(`private put OK; token read ${g?.statusCode}; anonymous read ${anon.status} (expect 401/403)`);
  } finally {
    await del(b.url, { token: WRITE_TOKEN });
  }
  process.exit(0);
}

const rows = await sql.query(
  `SELECT id, user_id, file_path, mime_type FROM health_documents
    WHERE file_path ILIKE 'https://%.public.blob.vercel-storage.com/%'
    ORDER BY uploaded_at ASC`,
);
const todo = rows.filter(r => ownPathname(r.file_path, String(r.user_id)));
console.log(`${rows.length} public document(s); ${todo.length} in their owner's folder and eligible.`);
if (!args.has('--execute')) {
  console.log('Dry run only. Apply the file_path_public_legacy migration, then re-run with --execute.');
  process.exit(0);
}

const [col] = await sql.query(
  `SELECT 1 FROM information_schema.columns
    WHERE table_name = 'health_documents' AND column_name = 'file_path_public_legacy'`,
);
if (!col) { console.error('Migration (file_path_public_legacy) not applied; refusing to run.'); process.exit(1); }

let moved = 0;
for (const r of todo) {
  const pathname = ownPathname(r.file_path, String(r.user_id));
  const src = await get(r.file_path, { access: 'public', token: READ_TOKEN });
  if (!src || src.statusCode !== 200) { console.warn(`skip ${r.id}: source missing`); continue; }
  const bytes = Buffer.from(await new Response(src.stream).arrayBuffer());
  const copy = await put(pathname, bytes, {
    access: 'private', addRandomSuffix: true,
    contentType: r.mime_type || src.blob.contentType, token: WRITE_TOKEN,
  });
  const check = await get(copy.url, { access: 'private', token: WRITE_TOKEN });
  const checkLen = check?.statusCode === 200 ? (await new Response(check.stream).arrayBuffer()).byteLength : -1;
  if (checkLen !== bytes.length) { console.warn(`skip ${r.id}: copy verification failed`); continue; }
  const upd = await sql.query(
    `UPDATE health_documents SET file_path_public_legacy = file_path, file_path = $2
      WHERE id = $1 AND file_path = $3 RETURNING id`,
    [r.id, copy.url, r.file_path],
  );
  if (upd.length) moved++;
  else console.warn(`skip ${r.id}: row changed during rotation (private copy left unused)`);
}
console.log(`Rotated ${moved}/${todo.length}. Old public blobs untouched; rollback = restore file_path from file_path_public_legacy.`);
