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
    for (const label of ["Home", "Records", "Ask AI", "Visits", "Me"]) {
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
    expect(renderAt("/dashboard/baby/summary/print").container).toBeEmptyDOMElement();
  });

  it("is hidden on the visit prep sheet but not on Visits", () => {
    expect(renderAt("/dashboard/appointments/abc-123/prep").container).toBeEmptyDOMElement();
  });

  it("highlights the tab matching the current route", () => {
    renderAt("/dashboard/medical-history");
    expect(screen.getByText("Records").closest("a")).toHaveAttribute("aria-current", "page");
    // Home is exact-match only, so it must not be active on a child route.
    expect(screen.getByText("Home").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("adds the content-clearance body class while visible", () => {
    renderAt("/dashboard");
    expect(document.body.classList.contains("has-bottom-nav")).toBe(true);
  });

  it("is a readable tab bar: an icon per tab, no numbers, no rotated text", () => {
    const { container } = renderAt("/dashboard");
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const link of links) expect(link.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toMatch(/0[1-5]/);
    expect(container.innerHTML).not.toMatch(/writing-mode|rotate-/);
  });
});
