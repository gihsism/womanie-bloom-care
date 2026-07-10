import { describe, it, expect } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("returns an Error's message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back when an Error has an empty message", () => {
    expect(errorMessage(new Error(""))).toBe("Something went wrong");
  });

  it("returns a non-empty string as-is", () => {
    expect(errorMessage("just a string")).toBe("just a string");
  });

  it("falls back for empty / non-error / nullish values", () => {
    expect(errorMessage("")).toBe("Something went wrong");
    expect(errorMessage(null)).toBe("Something went wrong");
    expect(errorMessage(undefined)).toBe("Something went wrong");
    expect(errorMessage({ message: "nope" })).toBe("Something went wrong");
    expect(errorMessage(42)).toBe("Something went wrong");
  });

  it("honours a custom fallback", () => {
    expect(errorMessage(null, "Upload failed")).toBe("Upload failed");
    expect(errorMessage({}, "Upload failed")).toBe("Upload failed");
  });
});
