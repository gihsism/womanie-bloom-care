import { describe, it, expect } from "vitest";
import {
  newStateToken,
  safeEqual,
  readCookie,
  stateCookie,
  clearStateCookie,
  STATE_COOKIE,
} from "./oauth-state";

describe("newStateToken", () => {
  it("returns a long hex-ish token with no dashes", () => {
    const t = newStateToken();
    expect(t).toMatch(/^[a-f0-9]+$/);
    expect(t.length).toBeGreaterThanOrEqual(24);
  });

  it("returns a different value each call", () => {
    expect(newStateToken()).not.toBe(newStateToken());
  });
});

describe("safeEqual", () => {
  it("is true only for identical non-empty strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("is false for a mismatch or different length", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("never treats empty/missing values as a match", () => {
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual(null, null)).toBe(false);
    expect(safeEqual(undefined, "x")).toBe(false);
    expect(safeEqual("x", null)).toBe(false);
  });
});

describe("readCookie", () => {
  it("extracts a named cookie from the header", () => {
    expect(readCookie(`${STATE_COOKIE}=tok123`, STATE_COOKIE)).toBe("tok123");
    expect(readCookie(`a=1; ${STATE_COOKIE}=tok123; b=2`, STATE_COOKIE)).toBe("tok123");
  });

  it("returns null when absent or no header", () => {
    expect(readCookie("a=1; b=2", STATE_COOKIE)).toBeNull();
    expect(readCookie(undefined, STATE_COOKIE)).toBeNull();
  });

  it("does not match a cookie whose name is a suffix of another", () => {
    // "other_womanie_oauth_state" must not satisfy a read of the real name.
    expect(readCookie(`other_${STATE_COOKIE}=nope`, STATE_COOKIE)).toBeNull();
  });
});

describe("cookie serialization", () => {
  it("sets an HttpOnly, Secure, SameSite=Lax cookie with a positive max-age", () => {
    const c = stateCookie("tok123");
    expect(c).toContain(`${STATE_COOKIE}=tok123`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
    expect(c).toMatch(/Max-Age=\d+/);
    expect(c).not.toContain("Max-Age=0");
  });

  it("clears the cookie with Max-Age=0", () => {
    expect(clearStateCookie()).toContain("Max-Age=0");
  });
});
