import { describe, it, expect, vi } from "vitest";
import { onHealthDataChange, emitHealthDataChange } from "./data-events";

describe("data-events", () => {
  it("notifies a subscribed listener on emit", () => {
    const fn = vi.fn();
    const off = onHealthDataChange(fn);
    emitHealthDataChange();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("stops notifying after unsubscribe", () => {
    const fn = vi.fn();
    const off = onHealthDataChange(fn);
    off();
    emitHealthDataChange();
    expect(fn).not.toHaveBeenCalled();
  });

  it("notifies every current subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onHealthDataChange(a);
    const offB = onHealthDataChange(b);
    emitHealthDataChange();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("isolates a throwing listener so the rest still run", () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const offBad = onHealthDataChange(bad);
    const offGood = onHealthDataChange(good);
    expect(() => emitHealthDataChange()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offBad();
    offGood();
    consoleErr.mockRestore();
  });
});
