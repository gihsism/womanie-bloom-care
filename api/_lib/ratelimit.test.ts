import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkAndConsume } from "./ratelimit";

const WINDOW_MS = 24 * 60 * 60 * 1000;

// The bucket store is module-level with no reset hook, so each test uses
// a unique bucket name to stay isolated from the others.
let n = 0;
const freshName = () => `test-bucket-${n++}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkAndConsume", () => {
  it("allows exactly `limit` calls, then blocks", () => {
    const name = freshName();
    expect(checkAndConsume(name, "u1", 3).ok).toBe(true);
    expect(checkAndConsume(name, "u1", 3).ok).toBe(true);
    expect(checkAndConsume(name, "u1", 3).ok).toBe(true);
    expect(checkAndConsume(name, "u1", 3).ok).toBe(false);
  });

  it("decrements remaining as hits are consumed", () => {
    const name = freshName();
    expect(checkAndConsume(name, "u1", 3).remaining).toBe(2);
    expect(checkAndConsume(name, "u1", 3).remaining).toBe(1);
    expect(checkAndConsume(name, "u1", 3).remaining).toBe(0);
  });

  it("reports retryInSec from the oldest hit when blocked", () => {
    const name = freshName();
    checkAndConsume(name, "u1", 1); // consume the only slot at t0
    const blocked = checkAndConsume(name, "u1", 1);
    expect(blocked.ok).toBe(false);
    // Oldest hit was just now, so a slot frees in ~one full window.
    expect(blocked.retryInSec).toBe(WINDOW_MS / 1000);

    // An hour later, the wait shrinks by an hour.
    vi.advanceTimersByTime(60 * 60 * 1000);
    const later = checkAndConsume(name, "u1", 1);
    expect(later.ok).toBe(false);
    expect(later.retryInSec).toBe(WINDOW_MS / 1000 - 3600);
  });

  it("frees up again once the window has fully passed", () => {
    const name = freshName();
    checkAndConsume(name, "u1", 2);
    checkAndConsume(name, "u1", 2);
    expect(checkAndConsume(name, "u1", 2).ok).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1000);
    expect(checkAndConsume(name, "u1", 2).ok).toBe(true);
  });

  it("does not let blocked attempts extend the window", () => {
    const name = freshName();
    checkAndConsume(name, "u1", 1); // t0: only slot used
    // Hammer it just before the window closes; these are all blocked.
    vi.advanceTimersByTime(WINDOW_MS - 2000);
    expect(checkAndConsume(name, "u1", 1).ok).toBe(false);
    // Past the original hit's window, the slot frees despite the spam.
    vi.advanceTimersByTime(3000);
    expect(checkAndConsume(name, "u1", 1).ok).toBe(true);
  });

  it("keeps separate users independent", () => {
    const name = freshName();
    checkAndConsume(name, "u1", 1);
    expect(checkAndConsume(name, "u1", 1).ok).toBe(false);
    expect(checkAndConsume(name, "u2", 1).ok).toBe(true);
  });

  it("keeps separate endpoints independent", () => {
    const a = freshName();
    const b = freshName();
    checkAndConsume(a, "u1", 1);
    expect(checkAndConsume(a, "u1", 1).ok).toBe(false);
    expect(checkAndConsume(b, "u1", 1).ok).toBe(true);
  });
});
