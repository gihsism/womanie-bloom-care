import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const query = vi.fn();
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query }) }));

import { checkAndConsume, checkAndConsumeMemory, hashSubject, peekLimit, peekMemory } from "./ratelimit";

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

describe("checkAndConsumeMemory (fallback)", () => {
  it("allows exactly `limit` calls, then blocks", () => {
    const name = freshName();
    expect(checkAndConsumeMemory(name, "u1", 3).ok).toBe(true);
    expect(checkAndConsumeMemory(name, "u1", 3).ok).toBe(true);
    expect(checkAndConsumeMemory(name, "u1", 3).ok).toBe(true);
    expect(checkAndConsumeMemory(name, "u1", 3).ok).toBe(false);
  });

  it("decrements remaining as hits are consumed", () => {
    const name = freshName();
    expect(checkAndConsumeMemory(name, "u1", 3).remaining).toBe(2);
    expect(checkAndConsumeMemory(name, "u1", 3).remaining).toBe(1);
    expect(checkAndConsumeMemory(name, "u1", 3).remaining).toBe(0);
  });

  it("reports retryInSec from the oldest hit when blocked", () => {
    const name = freshName();
    checkAndConsumeMemory(name, "u1", 1); // consume the only slot at t0
    const blocked = checkAndConsumeMemory(name, "u1", 1);
    expect(blocked.ok).toBe(false);
    // Oldest hit was just now, so a slot frees in ~one full window.
    expect(blocked.retryInSec).toBe(WINDOW_MS / 1000);

    // An hour later, the wait shrinks by an hour.
    vi.advanceTimersByTime(60 * 60 * 1000);
    const later = checkAndConsumeMemory(name, "u1", 1);
    expect(later.ok).toBe(false);
    expect(later.retryInSec).toBe(WINDOW_MS / 1000 - 3600);
  });

  it("frees up again once the window has fully passed", () => {
    const name = freshName();
    checkAndConsumeMemory(name, "u1", 2);
    checkAndConsumeMemory(name, "u1", 2);
    expect(checkAndConsumeMemory(name, "u1", 2).ok).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1000);
    expect(checkAndConsumeMemory(name, "u1", 2).ok).toBe(true);
  });

  it("does not let blocked attempts extend the window", () => {
    const name = freshName();
    checkAndConsumeMemory(name, "u1", 1); // t0: only slot used
    // Hammer it just before the window closes; these are all blocked.
    vi.advanceTimersByTime(WINDOW_MS - 2000);
    expect(checkAndConsumeMemory(name, "u1", 1).ok).toBe(false);
    // Past the original hit's window, the slot frees despite the spam.
    vi.advanceTimersByTime(3000);
    expect(checkAndConsumeMemory(name, "u1", 1).ok).toBe(true);
  });

  it("keeps separate users independent", () => {
    const name = freshName();
    checkAndConsumeMemory(name, "u1", 1);
    expect(checkAndConsumeMemory(name, "u1", 1).ok).toBe(false);
    expect(checkAndConsumeMemory(name, "u2", 1).ok).toBe(true);
  });

  it("keeps separate endpoints independent", () => {
    const a = freshName();
    const b = freshName();
    checkAndConsumeMemory(a, "u1", 1);
    expect(checkAndConsumeMemory(a, "u1", 1).ok).toBe(false);
    expect(checkAndConsumeMemory(b, "u1", 1).ok).toBe(true);
  });
});

describe("checkAndConsume (Neon-backed)", () => {
  const OLD_URL = process.env.DATABASE_URL;
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test";
    query.mockReset();
    vi.spyOn(Math, "random").mockReturnValue(0.99); // no cleanup by default
  });
  afterEach(() => {
    process.env.DATABASE_URL = OLD_URL;
    vi.restoreAllMocks();
  });

  it("allows while the shared counter is under the limit", async () => {
    query.mockResolvedValueOnce([{ hits: 2 }]);
    const r = await checkAndConsume("login-ip", "1.2.3.4", 3);
    expect(r).toEqual({ ok: true, remaining: 1, limit: 3, retryInSec: 0 });
  });

  it("blocks when the upsert returns no row (already at the limit)", async () => {
    query.mockResolvedValueOnce([]);
    const r = await checkAndConsume("login-ip", "1.2.3.4", 3);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
    // Window = UTC day; fake clock is local midnight Jan 1, so the wait is
    // the rest of that UTC day: positive and at most one window.
    expect(r.retryInSec).toBeGreaterThan(0);
    expect(r.retryInSec).toBeLessThanOrEqual(WINDOW_MS / 1000);
  });

  it("stores only a hash of the subject, never the email/IP itself", async () => {
    query.mockResolvedValueOnce([{ hits: 1 }]);
    await checkAndConsume("login-email", "alice@example.com", 30);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO rate_limit_counters/);
    expect(sql).toMatch(/ON CONFLICT \(bucket, subject_hash, window_start\)/);
    expect(params[0]).toBe("login-email");
    expect(params[1]).toBe(hashSubject("alice@example.com"));
    expect(JSON.stringify(params)).not.toContain("alice");
    expect(params[3]).toBe(30);
  });

  it("uses the same window key for every call in one day (holds across instances)", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 9, 0, 0)));
    query.mockResolvedValue([{ hits: 1 }]);
    await checkAndConsume("x", "u1", 5);
    vi.advanceTimersByTime(60 * 60 * 1000);
    await checkAndConsume("x", "u1", 5);
    expect(query.mock.calls[0][1][2]).toBe(query.mock.calls[1][1][2]);
  });

  it("falls back to the in-memory limit when the table is missing, and logs no subject", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    query.mockRejectedValue(Object.assign(new Error('relation "rate_limit_counters" does not exist'), { code: "42P01" }));
    const name = freshName();
    expect((await checkAndConsume(name, "bob@example.com", 1)).ok).toBe(true);
    expect((await checkAndConsume(name, "bob@example.com", 1)).ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    for (const call of warn.mock.calls) expect(String(call.join(" "))).not.toContain("bob@");
  });

  it("runs an occasional cleanup of old windows", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    query.mockResolvedValue([{ hits: 1 }]);
    await checkAndConsume("x", "u1", 5);
    expect(query.mock.calls.some(c => /DELETE FROM rate_limit_counters WHERE window_start </.test(c[0]))).toBe(true);
  });
});

describe("peekLimit (read-only check)", () => {
  const OLD_URL = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = OLD_URL;
    vi.restoreAllMocks();
  });

  it("in memory: reports the state without consuming a hit", () => {
    const name = freshName();
    for (let i = 0; i < 5; i++) expect(peekMemory(name, "u1", 1).ok).toBe(true);
    checkAndConsumeMemory(name, "u1", 1);
    expect(peekMemory(name, "u1", 1).ok).toBe(false);
    // and it frees once the window has passed
    vi.advanceTimersByTime(WINDOW_MS + 1000);
    expect(peekMemory(name, "u1", 1).ok).toBe(true);
  });

  it("Neon: only SELECTs (never inserts) and blocks at the limit", async () => {
    process.env.DATABASE_URL = "postgres://test";
    query.mockReset();
    query.mockResolvedValueOnce([{ hits: 2 }]).mockResolvedValueOnce([{ hits: 3 }]).mockResolvedValueOnce([]);
    expect((await peekLimit("login-email", "a@b.ch", 3)).ok).toBe(true);
    expect((await peekLimit("login-email", "a@b.ch", 3)).ok).toBe(false);
    expect((await peekLimit("login-email", "a@b.ch", 3))).toEqual({ ok: true, remaining: 3, limit: 3, retryInSec: 0 });
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toMatch(/^\s*SELECT hits FROM rate_limit_counters/);
      expect(JSON.stringify(params)).not.toContain("a@b.ch");
    }
  });

  it("Neon error: falls back to the in-memory state instead of throwing", async () => {
    process.env.DATABASE_URL = "postgres://test";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    query.mockReset();
    query.mockRejectedValue(Object.assign(new Error("down"), { code: "57P01" }));
    expect((await peekLimit(freshName(), "u1", 1)).ok).toBe(true);
  });
});
