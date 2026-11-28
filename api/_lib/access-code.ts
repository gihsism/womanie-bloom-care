// Rules for a patient's share code (patient_access_codes), checked by
// /api/db before the row is written.
//
// The browser creates the code (src/components/dashboard/ShareWithDoctor.tsx:
// 8 characters from a read-aloud alphabet, valid 24 hours, single use) and
// inserts the row through /api/db. Before this check the server took the
// row as sent, so a modified client could store a short guessable code, one
// that never expires, or flip a used code back to unused. The server now
// holds the same rules the app shows: shape, lifetime, unused, and rows
// can't be edited afterwards (cancelling a code deletes it).

export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 8;
export const ACCESS_CODE_TTL_MS = 24 * 60 * 60 * 1000;
// Room for a phone clock that runs a little fast.
const CLOCK_SLACK_MS = 10 * 60 * 1000;

const CODE_RE = new RegExp(`^[${ACCESS_CODE_ALPHABET}]{${ACCESS_CODE_LENGTH}}$`);

export function isAccessCodeShape(code: unknown): code is string {
  return typeof code === 'string' && CODE_RE.test(code);
}

export type AccessCodeCheck = { ok: true } | { ok: false; error: string };

export function checkAccessCodeInsert(row: unknown, now = Date.now()): AccessCodeCheck {
  if (!row || typeof row !== 'object') return { ok: false, error: 'Missing data' };
  const r = row as Record<string, unknown>;
  if (!isAccessCodeShape(r.code)) return { ok: false, error: 'Invalid share code' };
  if (r.is_used !== undefined && r.is_used !== false) return { ok: false, error: 'A new share code must be unused' };
  const expires = typeof r.expires_at === 'string' ? Date.parse(r.expires_at) : NaN;
  if (!Number.isFinite(expires) || expires <= now || expires > now + ACCESS_CODE_TTL_MS + CLOCK_SLACK_MS) {
    return { ok: false, error: 'A share code is valid for at most 24 hours' };
  }
  return { ok: true };
}
