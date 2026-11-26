import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MaintenanceBanner } from "./MaintenanceBanner";

function mockFetch(impl: () => Promise<unknown>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MaintenanceBanner", () => {
  it("shows nothing when maintenance is off (the default)", async () => {
    const fetchMock = mockFetch(async () => ({ ok: true, json: async () => ({ maintenance: false, message: null }) }));
    render(<MaintenanceBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/maintenance", { cache: "no-store" }));
    expect(screen.queryByTestId("maintenance-banner")).toBeNull();
  });

  it("shows the server's message when maintenance is on", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ maintenance: true, message: "Moving house, back soon." }) }));
    render(<MaintenanceBanner />);
    expect(await screen.findByTestId("maintenance-banner")).toHaveTextContent("Moving house, back soon.");
  });

  it("shows nothing when the check fails (offline or old server)", async () => {
    const fetchMock = mockFetch(async () => { throw new Error("offline"); });
    render(<MaintenanceBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("maintenance-banner")).toBeNull();
  });

  it("shows nothing on a non-OK response", async () => {
    const fetchMock = mockFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    render(<MaintenanceBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("maintenance-banner")).toBeNull();
  });
});
