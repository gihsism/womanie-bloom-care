import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { testExplanations, findExplanation, generateFallbackNote } from "./testExplanations";
import type { MedicalDataItem } from "./medical-utils";

const item = (o: Partial<MedicalDataItem> = {}): MedicalDataItem => ({
  id: "1", data_type: "lab_result", title: "Ferritin", value: null, unit: null, reference_range: null,
  status: null, date_recorded: null, notes: null, created_at: "2026-01-01T00:00:00Z", document_id: null, ...o,
});

const all = Object.values(testExplanations).flatMap(e => [e.high, e.low]).join("\n");

describe("testExplanations wording (sources: MedlinePlus, testing.com, NHS / NICE CKS)", () => {
  it("never diagnoses: no 'indicates', 'confirms', 'suggests prediabetes'", () => {
    expect(all).not.toMatch(/\bindicates?\b/i);
    expect(all).not.toMatch(/\bconfirms?\b/i);
    expect(all).not.toMatch(/suggests (pre)?diabetes/i);
  });

  it("gives no doses or thresholds of its own (the lab's range rules)", () => {
    expect(all).not.toMatch(/\bIU\b/);
    expect(all).not.toMatch(/\d+(\.\d+)?\s*%/); // the old HbA1c 5.7 % / 6.5 % cut-offs
    expect(all).not.toMatch(/\d+\s*(mg|mcg|µg|ng|mmol)/i);
  });

  it("recommends no supplements or medicines", () => {
    expect(all).not.toMatch(/glycinate|statins?|prenatal vitamin|supplements? (can|may) help|injections can help|iron-rich/i);
  });

  it("gives no verdicts", () => {
    expect(all).not.toMatch(/this is good|good for fertility|generally (good|protective)|it'?s treatable|is normal and not a concern/i);
  });

  it("drops the claims the sources do not support", () => {
    // Blood calcium does not show bone density (MedlinePlus).
    expect(testExplanations.calcium.low).not.toMatch(/affect bone density/i);
    expect(testExplanations.calcium.low).toMatch(/does not show how much calcium is in your bones/);
    // Magnesium: no PMS / sleep / anxiety claims.
    expect(testExplanations.magnesium.low).not.toMatch(/PMS|sleep|anxiety/i);
    // CRP: no PMS / fertility claims.
    expect(testExplanations.crp.high).not.toMatch(/PMS|fertility/i);
    // Estradiol: no endometriosis.
    expect(testExplanations.estradiol.high).not.toMatch(/endometriosis/i);
    // hCG: one level does not date a pregnancy; no "rising is a good sign".
    expect(testExplanations.hcg.high).not.toMatch(/estimate how far along/i);
    expect(testExplanations.hcg.low).not.toMatch(/good sign/i);
    // AMH does not tell whether she can get pregnant.
    expect(testExplanations.amh.low).toMatch(/does not tell you whether you can get pregnant/);
    // Low fasting glucose: no invented reassurance.
    expect(testExplanations.glucose.low).not.toMatch(/usually not concerning|usually fine/i);
  });

  it("uses 'can' phrasing in every high / low note", () => {
    for (const [name, e] of Object.entries(testExplanations)) {
      for (const text of [e.high, e.low]) {
        expect(text, `${name}: ${text}`).toMatch(/\bcan\b|usually|often|rare|uncommon|expected|normal/i);
      }
    }
  });

  it("is the only explanation map (MedicalHistory.tsx and medical-utils.ts use it)", () => {
    const page = readFileSync(resolve(__dirname, "../pages/MedicalHistory.tsx"), "utf8");
    const utils = readFileSync(resolve(__dirname, "./medical-utils.ts"), "utf8");
    expect(page).not.toMatch(/const testExplanations/);
    expect(page).not.toMatch(/function generateFallbackNote/);
    expect(utils).not.toMatch(/const testExplanations/);
  });
});

describe("findExplanation", () => {
  it("matches the longest whole-word name", () => {
    expect(findExplanation("HDL Cholesterol")).toBe(testExplanations.hdl);
    expect(findExplanation("LDL cholesterol")).toBe(testExplanations.ldl);
    expect(findExplanation("Hemoglobin A1c")).toBe(testExplanations.hba1c);
    expect(findExplanation("Hemoglobin")).toBe(testExplanations.hemoglobin);
    expect(findExplanation("Vitamin D, 25-Hydroxy")).toBe(testExplanations["vitamin d"]);
    expect(findExplanation("hs-CRP")).toBe(testExplanations.crp);
    expect(findExplanation("Total Cholesterol")).toBe(testExplanations["total cholesterol"]);
    expect(findExplanation("Serum iron")).toBe(testExplanations.iron);
  });

  it("does not match a name inside another word", () => {
    expect(findExplanation("Gastrin")).toBeUndefined(); // not AST
    expect(findExplanation("Cobalt")).toBeUndefined(); // not ALT
    expect(findExplanation("Widget")).toBeUndefined();
  });

  it("does not lend a test's note to a related test that reads the other way", () => {
    expect(findExplanation("Total iron binding capacity")).toBeUndefined(); // high TIBC = low iron
    expect(findExplanation("Transferrin saturation")).toBeUndefined();
    expect(findExplanation("Mean corpuscular hemoglobin")).toBeUndefined();
    expect(findExplanation("Albumin/Creatinine ratio")).toBeUndefined();
    expect(findExplanation("Urine glucose")).toBeUndefined();
    expect(findExplanation("Non-HDL cholesterol")).toBeUndefined();
  });
});

describe("generateFallbackNote", () => {
  it("defers to the lab's range and sends her to her doctor", () => {
    const note = generateFallbackNote(item({ title: "TSH", value: "8.5", unit: "mIU/L", reference_range: "0.4-4.0", status: "abnormal" }));
    expect(note).toContain("above the lab's range (lab's range: 0.4-4.0 mIU/L)");
    expect(note).toContain("can mean the thyroid is working slowly");
    expect(note).toContain("Ask your doctor what it means for you");
    expect(note).not.toMatch(/healthy/i);
  });

  it("takes the direction from a high / low status word when there is no range", () => {
    const note = generateFallbackNote(item({ title: "Ferritin", value: "8", status: "low" }));
    expect(note).toContain("below the lab's range");
    expect(note).toContain("iron stores are low");
  });

  it("keeps the urgent wording for a critical result", () => {
    const note = generateFallbackNote(item({ title: "Ferritin", value: "3", reference_range: "15-150", status: "critical" }));
    expect(note).toContain("The lab marked this as urgent");
  });

  it("says nothing for borderline, informational or no status (never 'healthy')", () => {
    expect(generateFallbackNote(item({ status: "borderline" }))).toBeNull();
    expect(generateFallbackNote(item({ status: "informational" }))).toBeNull();
    expect(generateFallbackNote(item({ status: null }))).toBeNull();
  });
});
