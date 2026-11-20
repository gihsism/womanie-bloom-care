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
    <MemoryRouter initialEntries={["/dashboard"]}>
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

  it("reserves its height at the bottom of the page while shown", () => {
    const { unmount } = renderBanner();
    expect(document.body.classList.contains("has-install-banner")).toBe(false);
    fireBeforeInstallPrompt();
    expect(document.body.classList.contains("has-install-banner")).toBe(true);
    unmount();
    expect(document.body.classList.contains("has-install-banner")).toBe(false);
  });

  it("steps aside while a dialog is open, and comes back after", async () => {
    renderBanner();
    fireBeforeInstallPrompt();
    expect(screen.getByText(/install womanie/i)).toBeInTheDocument();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    await act(async () => {
      document.body.appendChild(dialog);
    });
    expect(screen.queryByText(/install womanie/i)).toBeNull();
    expect(document.body.classList.contains("has-install-banner")).toBe(false);

    await act(async () => {
      dialog.remove();
    });
    expect(screen.getByText(/install womanie/i)).toBeInTheDocument();
  });

  it("steps aside while a form that opts out is on screen (e.g. Add a feed)", async () => {
    renderBanner();
    fireBeforeInstallPrompt();
    const form = document.createElement("div");
    form.setAttribute("data-hide-install-banner", "");
    await act(async () => {
      document.body.appendChild(form);
    });
    expect(screen.queryByText(/install womanie/i)).toBeNull();
    await act(async () => {
      form.remove();
    });
    expect(screen.getByText(/install womanie/i)).toBeInTheDocument();
  });

  it("steps aside while the user is typing in a field", async () => {
    renderBanner();
    fireBeforeInstallPrompt();
    const input = document.createElement("input");
    document.body.appendChild(input);
    await act(async () => {
      input.focus();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(screen.queryByText(/install womanie/i)).toBeNull();
    await act(async () => {
      input.blur();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(screen.getByText(/install womanie/i)).toBeInTheDocument();
    input.remove();
  });
});
