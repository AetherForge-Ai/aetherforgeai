/**
 * Analytics consent. The measurement tag stays unloaded until Accept.
 * A previous "dismissed" notice is not an acceptance.
 */

export const CONSENT_STORAGE_KEY = "af-analytics-consent";
export const CONSENT_CHANGE_EVENT = "af-consent-change";
export const OPEN_COOKIE_SETTINGS_EVENT = "af-open-cookie-settings";

export type AnalyticsChoice = "granted" | "denied";

/** GA4 measurement id only. Anything else is refused before it can be interpolated into a script URL. */
export function googleMeasurementId(raw: string | null | undefined = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID): string | null {
  const id = String(raw ?? "").trim();
  return /^G-[A-Z0-9]+$/.test(id) ? id : null;
}

export function shouldLoadGtag(choice: AnalyticsChoice | null, id: string | null): boolean {
  return choice === "granted" && id != null && googleMeasurementId(id) === id;
}

/**
 * Consent Mode v2. Everything starts denied. This snippet does not load gtag.js.
 */
export const CONSENT_DEFAULT_DENIED_SNIPPET = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
  wait_for_update: 500
});
`.trim();

export function readAnalyticsChoice(): AnalyticsChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (value === "granted" || value === "denied") return value;
    return null;
  } catch {
    return null;
  }
}

export function writeAnalyticsChoice(choice: AnalyticsChoice): void {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}
