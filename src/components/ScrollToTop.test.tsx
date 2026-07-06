import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { ScrollToTop } from "./ScrollToTop";

// A tiny in-router harness so tests can trigger navigations.
function Nav() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/records")}>go-path</button>
      <button onClick={() => navigate("/records#section")}>go-hash</button>
    </>
  );
}

function renderInRouter() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ScrollToTop />
      <Nav />
    </MemoryRouter>,
  );
}

describe("ScrollToTop", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it("scrolls to the top when the path changes", async () => {
    renderInRouter();
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear(); // ignore the mount call
    await userEvent.click(screen.getByText("go-path"));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("does NOT scroll when only a hash/anchor is present", async () => {
    renderInRouter();
    (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mockClear();
    await userEvent.click(screen.getByText("go-hash"));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(
      <MemoryRouter>
        <ScrollToTop />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
