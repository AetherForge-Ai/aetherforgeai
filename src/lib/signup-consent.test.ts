import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";
import {
  TERMS_VERSION,
  consentFields,
  createUserWithConsentFallback,
  signupCountry,
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
      {
        email: "a@b.co",
        age_confirmed: "yes",
        terms_accepted_at: "2026-10-07T06:00:00.000Z",
        terms_version: TERMS_VERSION,
        country: "New Zealand",
      },
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
    // H-4/signup: country is required on Totalum; the fallback keeps it.
    expect(calls[1]).toHaveProperty("country", "New Zealand");
    expect(warn).toHaveBeenCalledWith("[consent] user columns missing");
    warn.mockRestore();
  });

  it("never strips country, even when Totalum's error names it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: Record<string, unknown>[] = [];
    await createUserWithConsentFallback(
      { email: "a@b.co", age_confirmed: "yes", terms_version: TERMS_VERSION, country: "Australia" },
      async (row) => {
        calls.push(row);
        return { record: null, error: { errorMessage: "unknown field country" } };
      }
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const row of calls) expect(row).toHaveProperty("country", "Australia");
  });

  it("fills a missing country with Unknown so the required column is set", async () => {
    const calls: Record<string, unknown>[] = [];
    const created = await createUserWithConsentFallback({ email: "a@b.co", age_confirmed: "yes" }, async (row) => {
      calls.push(row);
      return row.country ? { record: { _id: "u3" }, error: null } : { record: null, error: { errorMessage: "country is required" } };
    });
    expect(created).toEqual({ _id: "u3" });
    expect(calls[0]).toHaveProperty("country", "Unknown");
    expect(signupCountry("  New Zealand ")).toBe("New Zealand");
    expect(signupCountry("")).toBe("Unknown");
    expect(signupCountry(undefined)).toBe("Unknown");
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
  it("sets security headers once, in next.config", () => {
    const next = readFileSync("next.config.ts", "utf8");
    const middleware = readFileSync("src/middleware.ts", "utf8");
    expect(next).toContain("poweredByHeader: false");
    expect(next).toContain("preserveDynamicSegmentTraces");
    expect(next).toContain("SECURITY_HEADERS");
    expect(middleware).not.toContain("SECURITY_HEADERS");
    expect(middleware).not.toContain("addCspHeaders");
  });

  it("allows the Totalum editor and leaves localhost out", () => {
    // CR-5 / BL-4: enforced script policy, Totalum test origin off by default.
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'self' https://web.totalum.app");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toContain("totalum-frontend-test");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toMatch(/localhost/);
  });
});
