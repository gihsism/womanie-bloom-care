import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import GuidesSection from "./GuidesSection";

describe("GuidesSection", () => {
  it("starts closed by default", () => {
    render(<GuidesSection title="Guides"><p>Eat well</p></GuidesSection>);
    expect(screen.queryByText("Eat well")).toBeNull();
    expect(screen.getByRole("button", { name: /Guides/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("starts open when reached through a #guides link (defaultOpen)", () => {
    render(<GuidesSection title="Guides" defaultOpen><p>Eat well</p></GuidesSection>);
    expect(screen.getByText("Eat well")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Guides/ }));
    expect(screen.queryByText("Eat well")).toBeNull();
  });
});
