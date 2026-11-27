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
  it("counts each test once, by its latest reading (a re-tested TSH is healthy, not to discuss)", async () => {
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
    expect(await screen.findByText(/1 healthy/)).toBeInTheDocument();
    expect(screen.getByText(/1 to discuss/)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    // The flagged preview lists Ferritin only.
    expect(container.innerHTML).toContain("Ferritin");
    expect(container.innerHTML).not.toContain("TSH");
  });
});
