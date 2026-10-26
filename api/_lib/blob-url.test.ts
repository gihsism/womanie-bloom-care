import { describe, it, expect } from "vitest";
import { isBlobUrl } from "./blob-url";

describe("isBlobUrl", () => {
  it("accepts Vercel Blob https URLs", () => {
    expect(isBlobUrl("https://qmflbejdd2tnqxv9.public.blob.vercel-storage.com/user_1/a.pdf")).toBe(true);
  });
  it("rejects other hosts, http, look-alikes and junk", () => {
    for (const u of [
      "http://qmflbejdd2tnqxv9.public.blob.vercel-storage.com/a.pdf",
      "https://169.254.169.254/latest/meta-data",
      "https://evil.com/x.blob.vercel-storage.com",
      "https://blob.vercel-storage.com.evil.com/a.pdf",
      "file:///etc/passwd",
      "not a url",
    ]) expect(isBlobUrl(u)).toBe(false);
  });
});
