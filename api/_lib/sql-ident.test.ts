import { describe, it, expect } from "vitest";
import { isIdent, isIdentList } from "./sql-ident";

describe("isIdent", () => {
  it("accepts plain column identifiers", () => {
    for (const c of ["id", "user_id", "period_start_date", "_x", "A1"]) {
      expect(isIdent(c)).toBe(true);
    }
  });

  it("rejects anything that isn't a bare identifier", () => {
    for (const bad of [
      "*",
      "user_id, password",
      "id; DROP TABLE x",
      "(SELECT secret FROM auth_users)",
      "id = 1 OR 1=1",
      "1col",
      "table.col",
      "",
      42,
      null,
      undefined,
    ]) {
      expect(isIdent(bad)).toBe(false);
    }
  });
});

describe("isIdentList", () => {
  it("accepts a single identifier and comma-separated lists (with spaces)", () => {
    expect(isIdentList("id")).toBe(true);
    expect(isIdentList("user_id,period_start_date")).toBe(true);
    expect(isIdentList("user_id, signal_date")).toBe(true);
  });

  it("rejects '*' (callers handle the star case separately)", () => {
    expect(isIdentList("*")).toBe(false);
  });

  it("rejects a list where any element smuggles SQL", () => {
    expect(isIdentList("id,(SELECT secret FROM auth_users)")).toBe(false);
    expect(isIdentList("id, value); DROP TABLE x --")).toBe(false);
    expect(isIdentList("")).toBe(false);
    expect(isIdentList(null)).toBe(false);
  });
});
