import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

// Thenable chain: handles .select().eq().eq() then await -> { data }.
vi.mock("@/integrations/db/client", () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: (onF: (v: unknown) => unknown) => Promise.resolve({ data: state.rows }).then(onF),
  };
  return { db: { from: () => chain } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/data-events", () => ({ onHealthDataChange: () => () => {} }));

import OverdueTests from "./OverdueTests";

const item = (title: string, date: string) => ({
  title,
  date_recorded: date,
  data_type: "lab_result",
  raw_data: null,
});

function renderCard() {
  return render(
    <MemoryRouter>
      <OverdueTests />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Fake only Date so differenceInMonths sees a fixed "now"; leave the
  // real setTimeout/microtasks so async render + findBy polling still work.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 5, 1)); // 2026-06-01
  state.rows = [];
});
afterEach(() => vi.useRealTimers());

describe("OverdueTests", () => {
  it("flags a test with 2+ readings whose latest is 12+ months old", async () => {
    state.rows = [item("Ferritin", "2025-01-01"), item("Ferritin", "2024-06-01")];
    renderCard();
    expect(await screen.findByText("Tests you haven't seen in a while")).toBeInTheDocument();
    // Title renders via getFriendlyName ("Ferritin — your iron stores").
    expect(screen.getByText(/Ferritin/)).toBeInTheDocument();
  });

  it("hides a test with only one prior reading", async () => {
    state.rows = [item("Ferritin", "2025-01-01")];
    const { container } = renderCard();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("hides a test seen within the last 12 months", async () => {
    state.rows = [item("Ferritin", "2026-03-01"), item("Ferritin", "2025-11-01")];
    const { container } = renderCard();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
