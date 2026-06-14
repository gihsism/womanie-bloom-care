import { describe, it, expect } from "vitest";
import {
  getStatusInfo,
  getFriendlyName,
  generateFallbackNote,
  friendlyStatus,
  type MedicalDataItem,
} from "./medical-utils";

function item(overrides: Partial<MedicalDataItem> = {}): MedicalDataItem {
  return {
    id: "1",
    data_type: "lab_result",
    title: "Ferritin",
    value: null,
    unit: null,
    reference_range: null,
    status: null,
    date_recorded: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    document_id: null,
    ...overrides,
  };
}

describe("getStatusInfo", () => {
  it("maps a known status to its config", () => {
    expect(getStatusInfo("critical")).toBe(friendlyStatus.critical);
  });

  it("falls back to informational for unknown or null status", () => {
    expect(getStatusInfo("nonsense")).toBe(friendlyStatus.informational);
    expect(getStatusInfo(null)).toBe(friendlyStatus.informational);
  });
});

describe("getFriendlyName", () => {
  it("returns the friendly label for a known test", () => {
    expect(getFriendlyName("TSH")).toContain("thyroid");
  });

  it("returns the original title for an unknown test", () => {
    expect(getFriendlyName("Widget Level")).toBe("Widget Level");
  });
});

describe("generateFallbackNote", () => {
  it("never overrides an existing note", () => {
    expect(generateFallbackNote(item({ notes: "already here", status: "abnormal" }))).toBeNull();
  });

  it("returns the normal explanation for a normal result of a known test", () => {
    const note = generateFallbackNote(item({ title: "Ferritin", status: "normal" }));
    expect(note).toBe("Your iron stores look good.");
  });

  it("returns the normal explanation for an 'expected' result too", () => {
    const note = generateFallbackNote(item({ title: "Ferritin", status: "expected" }));
    expect(note).toBe("Your iron stores look good.");
  });

  it("returns null for a normal result of an unknown test", () => {
    expect(generateFallbackNote(item({ title: "Widget", status: "normal" }))).toBeNull();
  });

  it("builds a 'below range' note when value is under the reference range", () => {
    const note = generateFallbackNote(
      item({
        title: "Ferritin",
        value: "8",
        unit: "ng/mL",
        reference_range: "15-150",
        status: "abnormal",
      }),
    );
    expect(note).toContain("below the healthy range");
    expect(note).toContain("8 ng/mL");
    expect(note).toContain("healthy range: 15-150 ng/mL");
    expect(note).toContain("iron stores are depleted"); // explanation.low
  });

  it("builds an 'above range' note when value is over the reference range", () => {
    const note = generateFallbackNote(
      item({
        title: "TSH",
        value: "8.5",
        unit: "mIU/L",
        reference_range: "0.4-4.0",
        status: "abnormal",
      }),
    );
    expect(note).toContain("above the healthy range");
    expect(note).toContain("underactive"); // explanation.high
  });

  it("handles an en-dash reference range separator", () => {
    const note = generateFallbackNote(
      item({ title: "Ferritin", value: "8", reference_range: "15–150", status: "abnormal" }),
    );
    expect(note).toContain("below the healthy range");
  });

  it("matches a known test by substring when the title isn't an exact key", () => {
    const note = generateFallbackNote(
      item({ title: "Vitamin D, 25-Hydroxy", value: "12", reference_range: "30-100", status: "abnormal" }),
    );
    expect(note).toContain("below the healthy range");
    expect(note).toContain("bone health"); // vitamin d explanation.low
  });

  it("falls back to a generic note when direction is unknown (no range)", () => {
    const note = generateFallbackNote(item({ title: "Ferritin", value: "8", status: "critical" }));
    expect(note).toContain("outside the healthy range");
    expect(note).toContain("next doctor visit");
  });
});
