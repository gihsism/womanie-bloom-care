import { describe, it, expect } from 'vitest';
import { scorePassword } from './password-strength';

describe('scorePassword', () => {
  it('scores empty as 0 with no label', () => {
    const r = scorePassword('');
    expect(r.score).toBe(0);
    expect(r.label).toBe('');
  });

  it('flags anything under 8 chars as too short', () => {
    expect(scorePassword('short').score).toBe(1); // 5 chars
    expect(scorePassword('short').label).toBe('Too short');
    expect(scorePassword('short').hint).toBe('3 more characters needed.');
  });

  it('uses the singular "character" when one short', () => {
    expect(scorePassword('sevench').hint).toBe('1 more character needed.'); // 7 chars
  });

  it('rates an 8-char single-class password as weak', () => {
    const r = scorePassword('abcdefgh'); // lowercase only
    expect(r.score).toBe(2);
    expect(r.label).toBe('Weak');
  });

  it('rates two character classes at the 8-char floor as fair', () => {
    const r = scorePassword('abcd1234'); // lower + digit
    expect(r.score).toBe(3);
    expect(r.label).toBe('Fair');
  });

  it('keeps a long-but-low-variety password at fair', () => {
    const r = scorePassword('Abcdefghijkl'); // 12 chars, upper + lower = 2 classes
    expect(r.score).toBe(3);
    expect(r.label).toBe('Fair');
  });

  it('rates 12+ chars and 3 classes as good', () => {
    const r = scorePassword('Abcdefghij12'); // 12 chars, upper + lower + digit
    expect(r.score).toBe(4);
    expect(r.label).toBe('Good');
  });

  it('does not promote to strong without all four classes', () => {
    const r = scorePassword('Abcdefghijkl12'); // 14 chars but only 3 classes
    expect(r.score).toBe(4);
    expect(r.label).toBe('Good');
  });

  it('rates 14+ chars with all four classes as strong', () => {
    const r = scorePassword('Abcdefghijkl1!'); // 14 chars, 4 classes
    expect(r.score).toBe(5);
    expect(r.label).toBe('Strong');
  });

  it('does not let high variety alone (but short) reach strong', () => {
    const r = scorePassword('Abcd123!'); // 8 chars, all 4 classes
    expect(r.score).toBe(3); // length gates it to fair
    expect(r.label).toBe('Fair');
  });
});
