import { describe, it, expect } from 'vitest';
import { bodyObject, isEmailLike, isIsoDate, isPasswordInput, optionalText, MAX_PASSWORD } from './input';

describe('request input checks', () => {
  it('bodyObject: only a plain object passes, anything else becomes {}', () => {
    expect(bodyObject({ a: 1 })).toEqual({ a: 1 });
    for (const v of [undefined, null, 'x', 42, ['a']]) expect(bodyObject(v)).toEqual({});
  });

  it('isEmailLike: strings shaped like an address, bounded', () => {
    expect(isEmailLike('a@b.co')).toBe(true);
    for (const v of ['nope', 'a@b', 42, { toLowerCase: 1 }, null, `${'a'.repeat(250)}@b.co`]) {
      expect(isEmailLike(v)).toBe(false);
    }
  });

  it('isPasswordInput: non-empty string up to the cap', () => {
    expect(isPasswordInput('secret123')).toBe(true);
    expect(isPasswordInput('')).toBe(false);
    expect(isPasswordInput(12345678)).toBe(false);
    expect(isPasswordInput('x'.repeat(MAX_PASSWORD + 1))).toBe(false);
  });

  it('optionalText: absent or a short string', () => {
    expect(optionalText(undefined, 5)).toBe(true);
    expect(optionalText(null, 5)).toBe(true);
    expect(optionalText('abc', 5)).toBe(true);
    expect(optionalText('abcdef', 5)).toBe(false);
    expect(optionalText(7, 5)).toBe(false);
  });

  it('isIsoDate: real calendar dates only', () => {
    expect(isIsoDate('2026-11-01')).toBe(true);
    expect(isIsoDate('2026-11-01T08:00:00.000Z')).toBe(true);
    for (const v of ['garbage', '2026-13-45', '01/11/2026', 20261101, null]) expect(isIsoDate(v)).toBe(false);
  });
});
