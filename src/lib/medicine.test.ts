import { describe, it, expect } from 'vitest';
import { dueReminders } from './medicine';

const at = (h: number, m = 0) => { const d = new Date(2026, 10, 10, h, m); return d; };

describe('dueReminders', () => {
  it('nothing is due before the first reminder time', () => {
    expect(dueReminders(['08:00', '20:00'], 0, at(7, 59))).toEqual([]);
  });
  it('morning dose is due once 08:00 has passed and nothing was taken', () => {
    expect(dueReminders(['08:00', '20:00'], 0, at(9))).toEqual(['08:00']);
  });
  it('a logged dose covers the earliest passed reminder', () => {
    expect(dueReminders(['08:00', '20:00'], 1, at(12))).toEqual([]);
    expect(dueReminders(['20:00', '08:00'], 1, at(21))).toEqual(['20:00']);
  });
  it('ignores malformed times', () => {
    expect(dueReminders(['8am', '', '09:30'], 0, at(10))).toEqual(['09:30']);
  });
});
