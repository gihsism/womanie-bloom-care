// Small shared checks for request bodies. Handlers used to destructure
// req.body and call string methods straight away, so a number, an object or
// a missing body became a 500 (and a Sentry error) instead of a 400.

export const MAX_EMAIL = 254;
// bcrypt only reads the first 72 bytes; anything far longer is not a
// password anyone typed, and hashing it is wasted CPU.
export const MAX_PASSWORD = 200;

export function bodyObject(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

export function isEmailLike(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function isPasswordInput(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_PASSWORD;
}

/** A string of at most `max` characters, or undefined/null (absent). */
export function optionalText(v: unknown, max: number): v is string | undefined | null {
  return v === undefined || v === null || (typeof v === 'string' && v.length <= max);
}

/** YYYY-MM-DD (optionally with a time part) that parses to a real date. */
export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)
    && !Number.isNaN(new Date(v).getTime());
}
