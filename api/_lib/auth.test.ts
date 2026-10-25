import { describe, it, expect, vi, beforeEach } from "vitest";
import * as jose from "jose";
import type { VercelRequest } from "@vercel/node";

const query = vi.fn();
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query }) }));

import { getAuthUser } from "./auth";

const SECRET = "x".repeat(40);

async function token(claims: Record<string, unknown>) {
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

const req = (t?: string) =>
  ({ headers: { cookie: t ? `womanie_session=${t}` : "" } }) as unknown as VercelRequest;

describe("getAuthUser", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    process.env.DATABASE_URL = "postgres://test";
    query.mockReset();
  });

  it("returns null with no cookie", async () => {
    expect(await getAuthUser(req())).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns the user when the session row is live", async () => {
    query.mockResolvedValue([{ "?column?": 1 }]);
    const u = await getAuthUser(req(await token({ sub: "user_1", sid: "s1", email: "a@b.c" })));
    expect(u).toEqual({ id: "user_1", email: "a@b.c", name: undefined, sessionId: "s1" });
    expect(query.mock.calls[0][1]).toEqual(["s1", "user_1"]);
  });

  it("rejects a validly signed token whose session was revoked", async () => {
    query.mockResolvedValue([]);
    expect(await getAuthUser(req(await token({ sub: "user_1", sid: "s1" })))).toBeNull();
  });

  it("rejects a token without a session id", async () => {
    expect(await getAuthUser(req(await token({ sub: "user_1" })))).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a token signed with another secret", async () => {
    const forged = await new jose.SignJWT({ sub: "user_1", sid: "s1" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode("y".repeat(40)));
    expect(await getAuthUser(req(forged))).toBeNull();
  });
});
