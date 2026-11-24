import { describe, it, expect } from "vitest";
import { isBlobUrl, isOwnBlobUrl } from "./blob-url";

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

describe("isOwnBlobUrl", () => {
  const base = "https://qmflbejdd2tnqxv9.public.blob.vercel-storage.com";
  it("accepts a blob in the user's own folder", () => {
    expect(isOwnBlobUrl(`${base}/user_1/scan-AbC123.pdf`, "user_1")).toBe(true);
  });
  it("rejects another user's folder, prefix look-alikes, traversal and non-blob hosts", () => {
    for (const u of [
      `${base}/user_2/scan.pdf`,
      `${base}/user_10/scan.pdf`,
      `${base}/user_1x/scan.pdf`,
      `${base}/user_1/%2E%2E/user_2/scan.pdf`,
      `${base}/scan.pdf`,
      "https://evil.com/user_1/scan.pdf",
      "not a url",
    ]) expect(isOwnBlobUrl(u, "user_1")).toBe(false);
    expect(isOwnBlobUrl(`${base}/user_1/a.pdf`, "")).toBe(false);
  });
});
