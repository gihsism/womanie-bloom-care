import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InstallBanner } from "./InstallBanner";

// jsdom has no matchMedia; stub it to "not standalone" so the banner logic
// (which hides when already installed) proceeds down the installable path.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// Fire the Chromium install-availability event with the extra props the
// component reads off it.
function fireBeforeInstallPrompt() {
  const e = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome: "accepted" });
  act(() => {
    window.dispatchEvent(e);
  });
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <InstallBanner />
    </MemoryRouter>,
  );
}

describe("InstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia(false);
  });

  it("is hidden until the browser signals the app is installable", () => {
    renderBanner();
    expect(screen.queryByText(/install womanie/i)).toBeNull();
  });

  it("appears after beforeinstallprompt on Chromium/Android", () => {
    renderBanner();
    fireBeforeInstallPrompt();
    expect(screen.getByText(/install womanie/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^install$/i })).toBeInTheDocument();
  });

  it("stays hidden when it was dismissed recently", () => {
    localStorage.setItem("womanie-install-dismissed", String(new Date().getTime()));
    renderBanner();
    fireBeforeInstallPrompt();
    expect(screen.queryByText(/install womanie/i)).toBeNull();
  });

  it("does not render on the /install page", () => {
    render(
      <MemoryRouter initialEntries={["/install"]}>
        <InstallBanner />
      </MemoryRouter>,
    );
    fireBeforeInstallPrompt();
    expect(screen.queryByText(/install womanie/i)).toBeNull();
  });
});
