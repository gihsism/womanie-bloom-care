// Per-subject rate limit shared across endpoints (login, signup, redeem
// code, AI chat, document analysis, ...).
//
// Counters live in Neon (table rate_limit_counters, migration 014), so a
// limit holds across every Vercel instance instead of resetting with each
// cold pod. Fixed windows: one row per (bucket, subject, window start),
// bumped with a single atomic upsert. Subjects (user ids, IPs, emails) are
// stored only as a SHA-256 hash, so the table holds no personal data.
//
// Fallback: if the table is missing (migration not yet applied) or Neon
// errors, the call is logged (no subject in the log) and decided by the old
// per-pod in-memory limiter, so deploy order can never lock people out of
// sign-in. Stale rows are deleted opportunistically.

import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const WINDOW_MS = 24 * 60 * 60 * 1000;
// Rows older than this are deleted (the current window plus one spare).
const KEEP_MS = 2 * WINDOW_MS;
// Roughly one call in CLEANUP_EVERY triggers a cleanup DELETE.
const CLEANUP_EVERY = 50;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryInSec: number;
}

// ---------- in-memory fallback (per warm pod; the pre-014 behaviour) ----------

type Bucket = Map<string, number[]>;
const buckets: Map<string, Bucket> = new Map();

function getBucket(name: string): Bucket {
  let b = buckets.get(name);
  if (!b) {
    b = new Map();
    buckets.set(name, b);
  }
  return b;
}

export function checkAndConsumeMemory(name: string, subject: string, limit: number): RateLimitResult {
  const bucket = getBucket(name);
  const now = Date.now();
  const hits = (bucket.get(subject) ?? []).filter(t => now - t < WINDOW_MS);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryInSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    bucket.set(subject, hits);
    return { ok: false, remaining: 0, limit, retryInSec };
  }

  hits.push(now);
  bucket.set(subject, hits);
  return { ok: true, remaining: limit - hits.length, limit, retryInSec: 0 };
}

// ---------- Neon-backed counter ----------

export function hashSubject(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}

function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) return String((err as { code: unknown }).code);
  return err instanceof Error ? err.name : 'unknown';
}

/**
 * Consume one hit from `subject`'s bucket in the current window. Returns
 * `{ ok: true }` if allowed; `{ ok: false, retryInSec }` once the subject
 * has used `limit` hits in this window. Never throws.
 */
export async function checkAndConsume(
  name: string,
  subject: string,
  limit: number,
): Promise<RateLimitResult> {
  const url = process.env.DATABASE_URL;
  if (!url) return checkAndConsumeMemory(name, subject, limit);

  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const retryInSec = Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000));

  try {
    const sql = neon(url);
    // Only increment while under the limit, so blocked attempts don't pile
    // up. When the row is already at the limit the WHERE fails and nothing
    // is returned.
    const rows = (await sql.query(
      `INSERT INTO rate_limit_counters (bucket, subject_hash, window_start, hits)
       VALUES ($1, $2, to_timestamp($3::double precision / 1000), 1)
       ON CONFLICT (bucket, subject_hash, window_start)
       DO UPDATE SET hits = rate_limit_counters.hits + 1
         WHERE rate_limit_counters.hits < $4
       RETURNING hits`,
      [name, hashSubject(subject), windowStart, limit],
    )) as Array<{ hits: number }>;

    if (Math.random() * CLEANUP_EVERY < 1) {
      sql
        .query(`DELETE FROM rate_limit_counters WHERE window_start < to_timestamp($1::double precision / 1000)`, [
          now - KEEP_MS,
        ])
        .catch(err => console.warn('[ratelimit] cleanup failed:', errorCode(err)));
    }

    const hits = rows.length ? Number(rows[0].hits) : NaN;
    if (!Number.isFinite(hits) || hits > limit) {
      return { ok: false, remaining: 0, limit, retryInSec };
    }
    return { ok: true, remaining: Math.max(0, limit - hits), limit, retryInSec: 0 };
  } catch (err) {
    // 42P01 = rate_limit_counters does not exist yet (migration 014 not
    // applied). Log only the bucket and the error code, never the subject.
    console.warn(`[ratelimit] Neon counter unavailable for "${name}" (${errorCode(err)}); using in-memory limit`);
    return checkAndConsumeMemory(name, subject, limit);
  }
}

// ---------- read-only check ----------

export function peekMemory(name: string, subject: string, limit: number): RateLimitResult {
  const now = Date.now();
  const hits = (getBucket(name).get(subject) ?? []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    const retryInSec = Math.max(1, Math.ceil((WINDOW_MS - (now - hits[0])) / 1000));
    return { ok: false, remaining: 0, limit, retryInSec };
  }
  return { ok: true, remaining: limit - hits.length, limit, retryInSec: 0 };
}

/**
 * Is `subject` already at `limit` in the current window? Reads the counter
 * without consuming a hit. Used where only FAILED attempts should count
 * (sign-in per email): check first, consume only after a failure, so a
 * person who signs in successfully many times a day never uses up her own
 * allowance. Never throws; on any error it falls back like checkAndConsume.
 */
export async function peekLimit(name: string, subject: string, limit: number): Promise<RateLimitResult> {
  const url = process.env.DATABASE_URL;
  if (!url) return peekMemory(name, subject, limit);

  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const retryInSec = Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000));
  try {
    const sql = neon(url);
    const rows = (await sql.query(
      `SELECT hits FROM rate_limit_counters
        WHERE bucket = $1 AND subject_hash = $2 AND window_start = to_timestamp($3::double precision / 1000)`,
      [name, hashSubject(subject), windowStart],
    )) as Array<{ hits: number }>;
    const hits = rows.length ? Number(rows[0].hits) : 0;
    if (!Number.isFinite(hits) || hits >= limit) return { ok: false, remaining: 0, limit, retryInSec };
    return { ok: true, remaining: limit - hits, limit, retryInSec: 0 };
  } catch (err) {
    console.warn(`[ratelimit] Neon counter unavailable for "${name}" (${errorCode(err)}); using in-memory limit`);
    return peekMemory(name, subject, limit);
  }
}
