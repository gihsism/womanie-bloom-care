// Per-user per-day rate limit shared across Claude-calling endpoints.
//
// Pragmatic in-memory implementation: buckets live inside the warm
// Vercel serverless pod. Cold pods reset the counters, so effective
// daily limit is approximately LIMIT × number-of-warm-pods per user.
// That's a soft ceiling, not a hard one — good enough to prevent a
// runaway loop from racking up Anthropic cost, not intended as a
// billing-grade bucket. If we ever need that, swap this module's
// internals for Vercel KV or a Neon-backed `usage` table without
// changing any caller.

const WINDOW_MS = 24 * 60 * 60 * 1000;

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

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryInSec: number;
}

/**
 * Consume one hit from `userId`'s bucket in the named window. Returns
 * `{ ok: true }` if allowed; `{ ok: false, retryInSec }` if the user
 * has hit the limit.
 */
export function checkAndConsume(
  name: string,
  userId: string,
  limit: number,
): RateLimitResult {
  const bucket = getBucket(name);
  const now = Date.now();
  const hits = (bucket.get(userId) ?? []).filter(t => now - t < WINDOW_MS);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryInSec = Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000));
    bucket.set(userId, hits); // store the pruned list
    return { ok: false, remaining: 0, limit, retryInSec };
  }

  hits.push(now);
  bucket.set(userId, hits);
  return { ok: true, remaining: limit - hits.length, limit, retryInSec: 0 };
}
