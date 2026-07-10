import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import RecentFindings from "./RecentFindings";

const finding = (title: string, status: string, date = "2026-01-01") => ({
  id: title,
  document_id: "d1",
  title,
  value: "1",
  unit: null,
  reference_range: null,
  status,
  data_type: "lab_result",
  date_recorded: date,
  notes: null,
});

function renderCard() {
  return render(
    <MemoryRouter>
      <RecentFindings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.rows = [];
});

describe("RecentFindings", () => {
  it("renders nothing when no results are flagged", async () => {
    state.rows = [finding("Ferritin", "normal"), finding("TSH", "expected")];
    const { container } = renderCard();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows flagged findings with a critical count in the heading", async () => {
    state.rows = [finding("AbnormalTest", "abnormal"), finding("CriticalTest", "critical")];
    renderCard();
    expect(await screen.findByText("Results that need attention")).toBeInTheDocument();
    expect(screen.getByText(/2 flagged/)).toBeInTheDocument();
    expect(screen.getByText(/1 critical/)).toBeInTheDocument();
  });

  it("orders critical findings before abnormal ones", async () => {
    state.rows = [finding("AbnormalTest", "abnormal"), finding("CriticalTest", "critical")];
    const { container } = renderCard();
    await screen.findByText("Results that need attention");
    const html = container.innerHTML;
    expect(html.indexOf("CriticalTest")).toBeLessThan(html.indexOf("AbnormalTest"));
  });
});
