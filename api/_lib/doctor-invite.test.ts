import { describe, it, expect } from 'vitest';
import {
  generateInviteToken,
  hashInviteToken,
  looksLikeInviteToken,
  normalizeEmail,
  inviteLink,
  checkGln,
  INVITE_TTL_MS,
} from './doctor-invite';

describe('doctor invite tokens', () => {
  it('are random, 43-char base64url, and never repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateInviteToken();
      expect(looksLikeInviteToken(t)).toBe(true);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });

  it('are stored as a SHA-256 hash that differs from the token', () => {
    const t = generateInviteToken();
    const h = hashInviteToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(hashInviteToken(t)).toBe(h);
    expect(hashInviteToken(generateInviteToken())).not.toBe(h);
  });

  it('reject junk before any lookup', () => {
    expect(looksLikeInviteToken('short')).toBe(false);
    expect(looksLikeInviteToken("x' OR 1=1 --".padEnd(43, 'a'))).toBe(false);
    expect(looksLikeInviteToken(undefined)).toBe(false);
  });

  it('expire after 7 days', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('link to the doctor signup page', () => {
    expect(inviteLink('abc', 'https://womanie.info/')).toBe('https://womanie.info/auth/doctor-signup?invite=abc');
  });
});

describe('normalizeEmail', () => {
  it('lower-cases and trims, rejects non-emails', () => {
    expect(normalizeEmail('  Dr.Muster@Praxis.CH ')).toBe('dr.muster@praxis.ch');
    expect(normalizeEmail('not an email')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe('checkGln (hint for the admin, not a verdict)', () => {
  it('accepts a GLN with a correct GS1 check digit', () => {
    expect(checkGln('7601000000002')).toBe('valid');
    expect(checkGln('760 1000 0000 02')).toBe('valid');
  });
  it('flags a wrong check digit', () => {
    expect(checkGln('7601000000003')).toBe('bad_check_digit');
  });
  it('flags anything that is not 13 digits', () => {
    expect(checkGln('MD-12345')).toBe('not_a_gln');
    expect(checkGln(null)).toBe('not_a_gln');
  });
});
