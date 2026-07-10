import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/data-events", () => ({ onHealthDataChange: () => () => {} }));

import DoctorNotesCard from "./DoctorNotesCard";

const note = (id: string, title: string) => ({
  id,
  title,
  content: `content ${id}`,
  note_type: "general",
  created_at: "2026-01-01T00:00:00Z",
  doctor_name: "Smith",
  doctor_title: "Dr.",
  doctor_specialties: [],
  doctor_avatar_url: null,
});

function mockNotes(notes: unknown[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ notes }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DoctorNotesCard", () => {
  it("renders nothing when there are no visible notes", async () => {
    mockNotes([]);
    const { container } = render(<DoctorNotesCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows a singular heading and the note for one note", async () => {
    mockNotes([note("1", "Thyroid follow-up")]);
    render(<DoctorNotesCard />);
    expect(await screen.findByText("Note from your doctor")).toBeInTheDocument();
    expect(screen.getByText("Thyroid follow-up")).toBeInTheDocument();
  });

  it("shows a pluralized heading for multiple notes", async () => {
    mockNotes([note("1", "A"), note("2", "B")]);
    render(<DoctorNotesCard />);
    expect(await screen.findByText(/2 notes from your doctors/)).toBeInTheDocument();
  });

  it("initially shows only the first three of many notes", async () => {
    mockNotes([
      note("1", "First"),
      note("2", "Second"),
      note("3", "Third"),
      note("4", "Fourth"),
      note("5", "Fifth"),
    ]);
    render(<DoctorNotesCard />);
    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
    // 4th and 5th are collapsed behind the show-more control (VISIBLE_LIMIT=3).
    expect(screen.queryByText("Fourth")).toBeNull();
    expect(screen.queryByText("Fifth")).toBeNull();
  });
});
