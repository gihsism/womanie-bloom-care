import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Controllable mock results (vi.hoisted so they exist before the mock
// factory runs). Each test sets these in beforeEach / its own body.
const state = vi.hoisted(() => ({
  profile: { data: null as { full_name: string | null } | null },
  docs: { data: [] as unknown[] },
  signals: { data: [] as unknown[] },
}));

// Minimal fluent stand-in for the db client: select()/eq() chain, then
// either maybeSingle() (profiles) or await (arrays).
vi.mock("@/integrations/db/client", () => {
  const chainFor = (result: unknown) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve(result),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
    };
    return chain;
  };
  return {
    db: {
      from: (table: string) => {
        if (table === "profiles") return chainFor(state.profile);
        if (table === "health_documents") return chainFor(state.docs);
        return chainFor(state.signals);
      },
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/data-events", () => ({ onHealthDataChange: () => () => {} }));

import GettingStarted from "./GettingStarted";

function renderGS() {
  return render(
    <MemoryRouter>
      <GettingStarted />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.profile = { data: { full_name: null } };
  state.docs = { data: [] };
  state.signals = { data: [] };
});

describe("GettingStarted", () => {
  it("shows all three steps with CTAs for a brand-new user", async () => {
    renderGS();
    expect(await screen.findByText("Getting started")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log today" })).toBeInTheDocument();
  });

  it("renders nothing once every step is complete", async () => {
    state.profile = { data: { full_name: "Alena" } };
    state.docs = { data: [{ id: "d1" }] };
    state.signals = { data: [{ id: "s1" }] };
    const { container } = renderGS();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("drops the completed step's CTA but keeps the rest", async () => {
    state.profile = { data: { full_name: "Alena" } }; // name done; docs/signals not
    renderGS();
    // Card still shows because two steps remain.
    expect(await screen.findByText("Getting started")).toBeInTheDocument();
    // The completed profile step no longer offers its CTA...
    expect(screen.queryByRole("button", { name: "Complete profile" })).toBeNull();
    // ...while the unfinished steps still do.
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log today" })).toBeInTheDocument();
  });
});
