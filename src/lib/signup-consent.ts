/**
 * Signup consent. The published Terms date is 7 October 2026.
 * Bump TERMS_VERSION only when those Terms are re-issued.
 */
export const TERMS_VERSION = "2026-10-07";

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

export const CONSENT_COLUMN_KEYS = ["age_confirmed", "terms_accepted_at", "terms_version"] as const;

/**
 * Columns the signup create may omit when Totalum does not have them yet.
 * `country` is the country chosen on the register form.
 * TODO(owner): the Totalum user.country column must exist for that choice to persist.
 */
export const SIGNUP_OPTIONAL_COLUMN_KEYS = [...CONSENT_COLUMN_KEYS, "country"] as const;

export function withoutCountry<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row };
  delete next.country;
  return next;
}

export function withoutConsentColumns<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row };
  for (const key of SIGNUP_OPTIONAL_COLUMN_KEYS) delete next[key];
  return next;
}

function rowHasConsent(row: Record<string, unknown>): boolean {
  return CONSENT_COLUMN_KEYS.some((key) => row[key] != null && row[key] !== "");
}

function errorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.message} ${errorText((error as { multipleErrors?: unknown }).multipleErrors)}`;
  if (Array.isArray(error)) return error.map(errorText).join(" ");
  if (typeof error === "object") {
    const row = error as Record<string, unknown>;
    return [row.errorMessage, row.errorCode, row.message, errorText(row.errors), errorText(row.multipleErrors)]
      .filter((part) => part != null && part !== "")
      .join(" ");
  }
  return String(error);
}

/** Totalum rejected the user row because a consent column is not on the table. */
export function isUnknownConsentFieldError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  if (!text.trim()) return false;
  if (SIGNUP_OPTIONAL_COLUMN_KEYS.some((key) => text.includes(key))) return true;
  return /unknown (field|property|column)|does not exist|not found|invalid (field|property)|no such (field|property|column)/.test(text);
}

async function attemptCreate<T>(
  payload: Record<string, unknown>,
  create: (row: Record<string, unknown>) => Promise<{ record: T | null; error: unknown }>
): Promise<{ record: T | null; error: unknown }> {
  try {
    return await create(payload);
  } catch (error) {
    return { record: null, error };
  }
}

/**
 * Create the user with consent columns.
 * A missing country column is retried first on its own, so the consent record is kept.
 * Consent columns are dropped only if that second create is also rejected.
 */
export async function createUserWithConsentFallback<T>(
  payload: Record<string, unknown>,
  create: (row: Record<string, unknown>) => Promise<{ record: T | null; error: unknown }>
): Promise<T | null> {
  const first = await attemptCreate(payload, create);
  if (first.record) return first.record;
  if (!isUnknownConsentFieldError(first.error)) return null;

  let current = payload;
  if (payload.country != null && payload.country !== "") {
    current = withoutCountry(payload);
    const countryRetry = await attemptCreate(current, create);
    if (countryRetry.record) return countryRetry.record;
    if (!isUnknownConsentFieldError(countryRetry.error)) return null;
  }

  if (!rowHasConsent(current)) return null;
  console.warn("[consent] user columns missing");
  const stripped = await attemptCreate(withoutConsentColumns(current), create);
  return stripped.record;
}
