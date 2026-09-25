import { describe, expect, it } from "vitest";
import {
  cookieValue,
  sessionExpiresInFuture,
  signSessionToken,
  verifySignedSessionToken,
} from "@/lib/session-token";

const SECRET = "test-secret";
const TOKEN = "sess-1t-token";

describe("token-only session cookie", () => {
  it("reads the signed session token and ignores session_data", async () => {
    const signed = encodeURIComponent(await signSessionToken(TOKEN, SECRET));
    const header = [
      `__Secure-better-auth.session_token=${signed}`,
      "__Secure-better-auth.session_data=cached-other-book",
    ].join("; ");
    const raw = cookieValue(header, "__Secure-better-auth.session_token");
    expect(await verifySignedSessionToken(raw, SECRET)).toBe(TOKEN);
    expect(cookieValue(header, "__Secure-better-auth.session_data")).toBe("cached-other-book");
  });

  it("rejects a bad signature without treating that as a cookie clear", async () => {
    const signed = await signSessionToken(TOKEN, SECRET);
    const flipped = signed.slice(0, -2) + (signed.endsWith("A=") ? "B=" : "A=");
    expect(await verifySignedSessionToken(flipped, SECRET)).toBeNull();
    expect(await verifySignedSessionToken(signed, "other-secret")).toBeNull();
    expect(await verifySignedSessionToken("not-a-cookie", SECRET)).toBeNull();
  });

  it("treats an expired row as signed-out without a cookie side effect", () => {
    expect(sessionExpiresInFuture(new Date(Date.now() + 60_000))).toBe(true);
    expect(sessionExpiresInFuture(new Date(Date.now() - 1000))).toBe(false);
    expect(sessionExpiresInFuture("not-a-date")).toBe(false);
    expect(sessionExpiresInFuture(null)).toBe(false);
  });
});
