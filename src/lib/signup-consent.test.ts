import { describe, expect, it, vi } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";
import {
  TERMS_VERSION,
  consentFields,
  createUserWithConsentFallback,
  validateSignupConsent,
} from "./signup-consent";

describe("signup consent", () => {
  it("rejects a missing 18+ confirmation", () => {
    expect(validateSignupConsent({ email: "a@b.co", age_confirmed: false }).ok).toBe(false);
    expect(validateSignupConsent({ email: "a@b.co" }).ok).toBe(false);
    expect(validateSignupConsent(null).ok).toBe(false);
  });

  it("accepts an explicit confirmation and stamps the terms version", () => {
    expect(validateSignupConsent({ age_confirmed: "yes" }).ok).toBe(true);
    expect(validateSignupConsent({ age_confirmed: true }).ok).toBe(true);
    const stamped = consentFields(new Date("2026-10-07T06:00:00.000Z"));
    expect(stamped.terms_accepted_at).toBe("2026-10-07T06:00:00.000Z");
    expect(stamped.terms_version).toBe(TERMS_VERSION);
    expect(stamped.age_confirmed).toBe("yes");
  });

  it("retries the user create without consent columns when Totalum rejects them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls: Record<string, unknown>[] = [];
    const created = await createUserWithConsentFallback(
      { email: "a@b.co", age_confirmed: "yes", terms_accepted_at: "2026-10-07T06:00:00.000Z", terms_version: TERMS_VERSION },
      async (row) => {
        calls.push(row);
        if ("age_confirmed" in row) {
          return { record: null, error: { errorMessage: "unknown field age_confirmed" } };
        }
        return { record: { _id: "user-1", email: row.email }, error: null };
      }
    );
    expect(created).toEqual({ _id: "user-1", email: "a@b.co" });
    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toHaveProperty("age_confirmed");
    expect(calls[1]).not.toHaveProperty("terms_accepted_at");
    expect(calls[1]).not.toHaveProperty("terms_version");
    expect(warn).toHaveBeenCalledWith("[consent] user columns missing");
    warn.mockRestore();
  });

  it("does not retry a signup failure that is not a missing column", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const created = await createUserWithConsentFallback({ email: "a@b.co", age_confirmed: "yes" }, async () => {
      calls += 1;
      return { record: null, error: { errorMessage: "email already exists" } };
    });
    expect(created).toBeNull();
    expect(calls).toBe(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("preview framing", () => {
  it("allows the Totalum editor and leaves localhost out", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBe(
      "frame-ancestors 'self' https://web.totalum.app https://totalum-frontend-test.web.app"
    );
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toMatch(/localhost/);
  });
});
