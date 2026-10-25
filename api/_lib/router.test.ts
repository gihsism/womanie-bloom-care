import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { ROUTES, routeKey } from "../router";

function listRoutes(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return listRoutes(p, `${prefix}${f}/`);
    return f.endsWith(".ts") && !f.endsWith(".test.ts") ? [`${prefix}${f.slice(0, -3)}`] : [];
  });
}

describe("api catch-all router", () => {
  it("registers every handler file in api/_routes", () => {
    const files = listRoutes(join(__dirname, "../_routes")).sort();
    expect(Object.keys(ROUTES).sort()).toEqual(files);
    for (const k of files) expect(typeof ROUTES[k]).toBe("function");
  });

  it("maps request URLs to route keys", () => {
    expect(routeKey("/api/auth/login")).toBe("auth/login");
    expect(routeKey("/api/db?x=1")).toBe("db");
    expect(routeKey("/api/doctors/availability?doctor_id=a&date=b")).toBe("doctors/availability");
    expect(routeKey("/api/me/export/")).toBe("me/export");
    expect(routeKey("/api/router?__route=auth/me", "auth/me")).toBe("auth/me");
  });
});
