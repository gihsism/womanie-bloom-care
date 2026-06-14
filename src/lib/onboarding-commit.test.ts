import { describe, it, expect, afterEach, vi } from "vitest";
import { deriveLifeStage, derivePregnancyDueDate } from "./onboarding-commit";
import type { OnboardingData } from "@/contexts/OnboardingContext";

// The helpers only read a few fields; build minimal shapes and cast.
const make = (data: Partial<OnboardingData>): OnboardingData => data as OnboardingData;

afterEach(() => vi.useRealTimers());

describe("deriveLifeStage", () => {
  it("returns null when no stage is set", () => {
    expect(deriveLifeStage(make({}))).toBeNull();
    expect(deriveLifeStage(make({ lifeStage: {} as unknown as OnboardingData["lifeStage"] }))).toBeNull();
  });

  it.each([
    ["pre-menstrual", "pre-menstrual"],
    ["pregnant", "pregnancy"],
    ["postpartum", "postpartum"],
    ["menopause", "menopause"],
    ["trying-to-conceive", "conception"],
  ])("maps life stage %s -> %s", (stage, expected) => {
    expect(deriveLifeStage(make({ lifeStage: { stage } as unknown as OnboardingData["lifeStage"] }))).toBe(expected);
  });

  it("maps regular-cycle by its main focus", () => {
    const forFocus = (mainFocus: string) =>
      deriveLifeStage(
        make({
          lifeStage: { stage: "regular-cycle" } as unknown as OnboardingData["lifeStage"],
          regularCycle: { mainFocus } as unknown as OnboardingData["regularCycle"],
        }),
      );
    expect(forFocus("contraception")).toBe("contraception");
    expect(forFocus("conception")).toBe("conception");
    expect(forFocus("ivf")).toBe("ivf");
    expect(forFocus("anything-else")).toBe("menstrual-cycle");
  });

  it("defaults regular-cycle with no focus to menstrual-cycle", () => {
    expect(deriveLifeStage(make({ lifeStage: { stage: "regular-cycle" } as unknown as OnboardingData["lifeStage"] }))).toBe(
      "menstrual-cycle",
    );
  });
});

describe("derivePregnancyDueDate", () => {
  it("returns null when no pregnancy data", () => {
    expect(derivePregnancyDueDate(make({}))).toBeNull();
  });

  it("uses an explicit due date as-is", () => {
    const out = derivePregnancyDueDate(
      make({ pregnancy: { dateType: "dueDate", dueDate: "2026-09-01" } as unknown as OnboardingData["pregnancy"] }),
    );
    expect(out?.toISOString().split("T")[0]).toBe("2026-09-01");
  });

  // Day-offset assertions rather than fixed date strings, so they don't
  // flake on the runner's timezone (the input parses as UTC midnight but
  // date-fns adds days in local time).
  const dayDiff = (later: Date, earlier: Date) =>
    Math.round((later.getTime() - earlier.getTime()) / 86_400_000);

  it("adds 280 days to a last-period date (Naegele)", () => {
    const lmp = "2026-01-01";
    const out = derivePregnancyDueDate(
      make({ pregnancy: { dateType: "lastPeriod", lastPeriodDate: lmp } as unknown as OnboardingData["pregnancy"] }),
    );
    expect(out).not.toBeNull();
    expect(dayDiff(out!, new Date(lmp))).toBe(280);
  });

  it("projects a due date from the current week of pregnancy", () => {
    const now = new Date(2026, 0, 1, 12, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const out = derivePregnancyDueDate(
      make({ pregnancy: { dateType: "currentWeek", currentWeek: 30 } as unknown as OnboardingData["pregnancy"] }),
    );
    // 40 - 30 = 10 weeks left = 70 days from "today".
    expect(dayDiff(out!, now)).toBe(70);
  });

  it("never projects a negative due date when past 40 weeks", () => {
    const now = new Date(2026, 0, 1, 12, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const out = derivePregnancyDueDate(
      make({ pregnancy: { dateType: "currentWeek", currentWeek: 42 } as unknown as OnboardingData["pregnancy"] }),
    );
    // weeksLeft clamps at 0, so the due date is "today".
    expect(dayDiff(out!, now)).toBe(0);
  });

  it("returns null when the chosen date field is missing", () => {
    expect(
      derivePregnancyDueDate(make({ pregnancy: { dateType: "dueDate" } as unknown as OnboardingData["pregnancy"] })),
    ).toBeNull();
  });
});
