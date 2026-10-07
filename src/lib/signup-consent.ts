/**
 * Signup consent. The published Terms date is 2 July 2026.
 * Bump TERMS_VERSION only when those Terms are re-issued.
 */
export const TERMS_VERSION = "2026-07-02";

export const SIGNUP_CONSENT_ERROR = "Confirm you are 18 or over before creating an account.";

export function ageConfirmed(value: unknown): boolean {
  return value === true || value === "yes" || value === "true";
}

/** Reject a sign-up body that has no 18+ confirmation. */
export function validateSignupConsent(body: unknown): { ok: true } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: SIGNUP_CONSENT_ERROR };
  const row = body as Record<string, unknown>;
  if (!ageConfirmed(row.age_confirmed)) return { ok: false, error: SIGNUP_CONSENT_ERROR };
  return { ok: true };
}

export function consentFields(now = new Date()): {
  age_confirmed: "yes";
  terms_accepted_at: string;
  terms_version: string;
} {
  return {
    age_confirmed: "yes",
    terms_accepted_at: now.toISOString(),
    terms_version: TERMS_VERSION,
  };
}
