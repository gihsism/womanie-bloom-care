import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/integrations/db/client", () => {
  const chain = {
    select: () => chain,
    eq: () => Promise.resolve({ data: state.rows }),
  };
  return { db: { from: () => chain } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/data-events", () => ({ onHealthDataChange: () => () => {} }));

import HealthSummaryWidget from "./HealthSummaryWidget";

const lab = (title: string, status: string, date: string) => ({
  title, value: "1", unit: null, status, data_type: "lab_result", date_recorded: date,
});

describe("HealthSummaryWidget", () => {
  it("states a plain summary (latest reading per test), no wellness %, no repeated flagged list", async () => {
    state.rows = [
      lab("TSH", "abnormal", "2026-03-01"),
      lab("TSH", "normal", "2026-09-01"),
      lab("Ferritin", "abnormal", "2026-05-01"),
    ];
    const { container } = render(
      <MemoryRouter>
        <HealthSummaryWidget />
      </MemoryRouter>,
    );
    const summary = await screen.findByTestId("results-summary");
    expect(summary).toHaveTextContent(
      "1 of 2 latest results outside the lab's range · 1 moved in or out of range since the previous test",
    );
    expect(summary.tagName).toBe("BUTTON"); // links to the list on Records
    expect(container.textContent).not.toMatch(/%|wellness/i);
    expect(screen.queryByRole("progressbar")).toBeNull();
    // The flagged list is "Talk to your doctor about" on Records; the card does not repeat it.
    expect(container.textContent).not.toContain("Ferritin");
  });

  it("scrolls to the list when tapped", async () => {
    state.rows = [lab("Ferritin", "abnormal", "2026-05-01")];
    const target = document.createElement("div");
    target.id = "attention";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    render(
      <MemoryRouter>
        <HealthSummaryWidget />
      </MemoryRouter>,
    );
    (await screen.findByTestId("results-summary")).click();
    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });
});
