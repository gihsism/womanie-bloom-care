import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const updatePushPrefs = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/push", async (orig) => {
  const real = await orig<typeof import("@/lib/push")>();
  return {
    ...real,
    fetchPushConfig: async () => ({ enabled: true, publicKey: "k" }),
    pushSupport: () => "ok",
    readPushEnv: () => ({}),
    currentSubscription: async () => ({}),
    // A device saved before the check-ups switch existed: the server reads it as on.
    serverPushState: async () => ({ ...real.DEFAULT_PUSH_PREFS }),
    updatePushPrefs,
  };
});
vi.mock("@/lib/platform", () => ({ isNativeApp: () => false }));

import PhoneNotifications from "./PhoneNotifications";

describe("PhoneNotifications", () => {
  it("offers a Vaccinations and check-ups switch, on by default, saved with the other choices", async () => {
    render(
      <MemoryRouter>
        <PhoneNotifications />
      </MemoryRouter>,
    );
    const sw = await screen.findByRole("switch", { name: "Vaccinations and check-ups" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/3 days before a pack or course runs out/)).toBeInTheDocument();
    fireEvent.click(sw);
    await waitFor(() => expect(updatePushPrefs).toHaveBeenCalledWith(expect.objectContaining({ checkups: false, medicine: true })));
  });
});
