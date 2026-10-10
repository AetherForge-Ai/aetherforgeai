import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSENT_DEFAULT_DENIED_SNIPPET,
  googleMeasurementId,
  shouldLoadGtag,
} from "@/lib/analytics-consent";
import { SECURITY_HEADERS } from "@/lib/security-headers";

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("U4 analytics consent", () => {
  it("denies Consent Mode v2 by default and does not load gtag.js in that snippet", () => {
    expect(CONSENT_DEFAULT_DENIED_SNIPPET).toContain("analytics_storage: 'denied'");
    expect(CONSENT_DEFAULT_DENIED_SNIPPET).toContain("ad_storage: 'denied'");
    expect(CONSENT_DEFAULT_DENIED_SNIPPET).toContain("ad_user_data: 'denied'");
    expect(CONSENT_DEFAULT_DENIED_SNIPPET).toContain("ad_personalization: 'denied'");
    expect(CONSENT_DEFAULT_DENIED_SNIPPET).not.toContain("googletagmanager");
    expect(CONSENT_DEFAULT_DENIED_SNIPPET).not.toContain("G-2ZH1DNK63H");
  });

  it("loads the tag only after Accept and only for a GA4 measurement id", () => {
    expect(shouldLoadGtag(null, "G-2ZH1DNK63H")).toBe(false);
    expect(shouldLoadGtag("denied", "G-2ZH1DNK63H")).toBe(false);
    expect(shouldLoadGtag("granted", null)).toBe(false);
    expect(shouldLoadGtag("granted", "GT-XXXX")).toBe(false);
    expect(shouldLoadGtag("granted", "https://evil.example")).toBe(false);
    expect(googleMeasurementId("G-2ZH1DNK63H")).toBe("G-2ZH1DNK63H");
    expect(shouldLoadGtag("granted", "G-2ZH1DNK63H")).toBe(true);
    const consent = read("src/lib/analytics-consent.ts");
    expect(consent).not.toContain("af-analytics-notice");
    expect(consent).not.toContain('=== "dismissed"');
  });

  it("keeps the measurement script out of the first render", () => {
    const tag = read("src/components/GoogleTag.tsx");
    expect(tag).toContain("useState(false)");
    expect(tag).toContain("if (!allowed || !tagId) return null");
    expect(tag).toContain("shouldLoadGtag");
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("CONSENT_DEFAULT_DENIED_SNIPPET");
    expect(layout).not.toContain("googletagmanager.com/gtag/js");
  });

  it("gives Accept and Decline the same weight and offers Cookie settings", () => {
    const notice = read("src/components/AnalyticsNotice.tsx");
    expect(notice).toContain("Accept");
    expect(notice).toContain("Decline");
    expect(notice).not.toContain("Dismiss");
    expect(notice.match(/className=\{choiceClass\}/g)).toHaveLength(2);
    expect(read("src/components/SiteFooter.tsx")).toContain("<CookieSettingsLink");
    expect(read("src/components/CookieSettingsLink.tsx")).toContain("Cookie settings");
  });

  it("describes the choice on the privacy cookies and analytics sections only", () => {
    const privacy = read("src/app/privacy-policy/page.tsx");
    expect(privacy).toContain("only after you accept analytics cookies");
    expect(privacy).toContain("The Google Analytics tag is not loaded until you choose Accept");
    expect(privacy).toContain("Cookie settings");
    const trust = read("src/app/trust/page.tsx");
    expect(trust).not.toContain("only after you accept analytics cookies");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBe(
      "frame-ancestors 'self' https://web.totalum.app https://totalum-frontend-test.web.app"
    );
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toContain("script-src");
  });
});
