import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineIndicator } from "./OfflineIndicator";

// First component test — also proves the jsdom harness (environmentMatchGlobs
// + jest-dom matchers + cleanup) is wired correctly.
describe("OfflineIndicator", () => {
  it("renders nothing while the browser is online", () => {
    render(<OfflineIndicator />);
    // jsdom reports navigator.onLine === true by default.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the banner when the browser goes offline", () => {
    render(<OfflineIndicator />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/offline/i);
  });

  it("hides again when the connection returns", () => {
    render(<OfflineIndicator />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
