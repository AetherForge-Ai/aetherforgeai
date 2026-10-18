/** b22: fixture and placeholder addresses never get real mail. */
export const TEST_EMAIL_DOMAIN_RE = /@example\.(test|invalid)$/i;

export function isTestEmailAddress(addr: unknown): boolean {
  return typeof addr === "string" && TEST_EMAIL_DOMAIN_RE.test(addr.trim());
}
