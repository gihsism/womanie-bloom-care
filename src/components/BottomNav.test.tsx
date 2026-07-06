import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "./BottomNav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("shows all five tabs on a dashboard route", () => {
    renderAt("/dashboard");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    for (const label of ["Home", "Records", "Ask AI", "Visits", "Settings"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("is hidden outside the dashboard area", () => {
    const { container } = renderAt("/");
    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden on print views", () => {
    const { container } = renderAt("/dashboard/health-record/print");
    expect(container).toBeEmptyDOMElement();
  });

  it("highlights the tab matching the current route", () => {
    renderAt("/dashboard/medical-history");
    expect(screen.getByText("Records").closest("a")).toHaveClass("text-primary");
    // Home is exact-match only, so it must not be active on a child route.
    expect(screen.getByText("Home").closest("a")).not.toHaveClass("text-primary");
  });

  it("adds the content-clearance body class while visible", () => {
    renderAt("/dashboard");
    expect(document.body.classList.contains("has-bottom-nav")).toBe(true);
  });
});
