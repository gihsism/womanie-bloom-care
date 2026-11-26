import { createHash, randomBytes } from 'node:crypto';

// One-time doctor invitation links.
//
// The raw token is 32 random bytes (base64url, 43 chars) and is only ever
// shown once, inside the link the admin copies. The database keeps its
// SHA-256 hash, so a leaked doctor_invites table can't be turned into
// working links. A plain (unsalted) hash is enough here: the token has
// 256 bits of entropy, so there is nothing to brute-force.

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

// Shape check before hashing/querying: rejects junk early and keeps
// arbitrary strings out of the query.
export function looksLikeInviteToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export function inviteLink(token: string, siteUrl = process.env.SITE_URL || 'https://womanie.info'): string {
  return `${siteUrl.replace(/\/+$/, '')}/auth/doctor-signup?invite=${encodeURIComponent(token)}`;
}

// Swiss GLN (Global Location Number) as used in MedReg: 13 digits,
// Swiss numbers start 760, last digit is the GS1 mod-10 check digit.
// Returned as a hint for the admin, never as an automatic verdict:
// the admin still looks the person up in MedReg.
export type GlnCheck = 'valid' | 'bad_check_digit' | 'not_a_gln';

export function checkGln(value: unknown): GlnCheck {
  if (typeof value !== 'string') return 'not_a_gln';
  const digits = value.replace(/[\s.-]/g, '');
  if (!/^\d{13}$/.test(digits)) return 'not_a_gln';
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]) ? 'valid' : 'bad_check_digit';
}

// The public Swiss register of medical professions. Link only: the admin
// searches it herself (we never scrape it).
export const MEDREG_URL = 'https://www.medregom.admin.ch/';
