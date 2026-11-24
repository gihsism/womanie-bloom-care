import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useScrollToHash } from "./useScrollToHash";

function Probe() {
  useScrollToHash(true);
  return null;
}

// A #medicines section whose top we control: after the hook scrolls to it
// (top -> 0), content above "loads" and pushes it down by 2,000 px.
function makeSection() {
  const el = document.createElement("div");
  el.id = "medicines";
  document.body.appendChild(el);
  let top = 2500;
  el.getBoundingClientRect = () => ({ top } as DOMRect);
  const scroll = vi.fn(() => { top = 0; });
  el.scrollIntoView = scroll;
  return { el, scroll, push: (px: number) => { top += px; } };
}

describe("useScrollToHash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  it("scrolls to the anchor and re-aligns when content above pushes it down", () => {
    const s = makeSection();
    render(<MemoryRouter initialEntries={["/dashboard/stage#medicines"]}><Probe /></MemoryRouter>);
    vi.advanceTimersByTime(200);
    expect(s.scroll).toHaveBeenCalledTimes(1);
    s.push(2000);
    vi.advanceTimersByTime(200);
    expect(s.scroll).toHaveBeenCalledTimes(2);
  });

  it("stops re-aligning once the person scrolls themselves", () => {
    const s = makeSection();
    render(<MemoryRouter initialEntries={["/dashboard/stage#medicines"]}><Probe /></MemoryRouter>);
    vi.advanceTimersByTime(200);
    window.dispatchEvent(new Event("wheel"));
    s.push(2000);
    vi.advanceTimersByTime(1000);
    expect(s.scroll).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a hash", () => {
    const s = makeSection();
    render(<MemoryRouter initialEntries={["/dashboard/stage"]}><Probe /></MemoryRouter>);
    vi.advanceTimersByTime(1000);
    expect(s.scroll).not.toHaveBeenCalled();
  });
});
