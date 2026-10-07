import { describe, expect, it } from "vitest";
import { TERMS_VERSION, consentFields, validateSignupConsent } from "./signup-consent";

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
});
