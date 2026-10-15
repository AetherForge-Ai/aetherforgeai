import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_PROVIDER_API_SENTENCE, AI_PROVIDER_NAME } from "@/lib/ai-provider-disclosure";
import { AI_REQUEST_LINES, LEDGER_EXPORT_LINE, PROCESSORS, SECURITY_LINE } from "@/lib/public-copy";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import {
  TRUST_HSTS,
  TRUST_PAGE_LOG,
  TRUST_PRIVACY_PHRASES,
  TRUST_SECURITY_TXT_CONTACT,
  TRUST_SECURITY_TXT_EXPIRES,
  TRUST_STORAGE_NAME,
  trustAiRetentionLine,
  trustBreachLine,
  trustDeletionLine,
  trustExportLine,
  trustRetentionLine,
  trustStorageLine,
  trustTransportLine,
} from "@/lib/trust-facts";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("trust page facts", () => {
  it("maps every stated fact to a header, a processor row, the AI lines, the privacy policy, or security.txt", () => {
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toBe(TRUST_HSTS);
    expect(trustTransportLine()).toBe(`The site response sets Strict-Transport-Security to ${TRUST_HSTS}.`);
    expect(read("src/app/trust/page.tsx")).toContain("SECURITY_LINE");
    expect(SECURITY_LINE).toContain("Encrypted in transit (HTTPS).");

    expect(PROCESSORS().some((row) => row.name === TRUST_STORAGE_NAME && row.role === "account storage")).toBe(true);
    expect(trustStorageLine()).toBe("Totalum on Google Cloud handles account storage.");
    expect(trustStorageLine()).not.toMatch(/region|sydney|australia-|us-central|europe-/i);

    expect(AI_REQUEST_LINES.join(" ")).toContain("Our code does not write the text of these requests to its logs");
    expect(trustAiRetentionLine()).toContain("Our code does not write the text of these requests to its logs");
    expect(trustExportLine()).toBe(LEDGER_EXPORT_LINE);

    const privacy = read("src/app/privacy-policy/page.tsx").replace(/\s+/g, " ");
    for (const phrase of TRUST_PRIVACY_PHRASES) {
      expect(privacy, phrase).toContain(phrase);
    }
    expect(trustRetentionLine()).toContain("only for as long as it is required for the purposes set out");
    expect(trustRetentionLine()).toContain("securely delete");
    expect(trustDeletionLine()).toContain("You may delete your holdings at any time, and you may request deletion of your account.");
    expect(trustDeletionLine()).toContain("generally 20 working days");
    expect(trustBreachLine()).toContain("Office of the Privacy Commissioner");

    const securityTxt = read("public/.well-known/security.txt");
    expect(securityTxt).toContain(`Contact: ${TRUST_SECURITY_TXT_CONTACT}`);
    expect(securityTxt).toContain(`Expires: ${TRUST_SECURITY_TXT_EXPIRES}`);
    expect(trustBreachLine()).toContain(TRUST_SECURITY_TXT_CONTACT);

    const page = read("src/app/trust/page.tsx");
    expect(page).toContain("trustTransportLine");
    expect(page).toContain("trustStorageLine");
    expect(page).toContain("trustRetentionLine");
    expect(page).toContain("trustDeletionLine");
    expect(page).toContain("trustExportLine");
    expect(page).toContain("trustBreachLine");
    expect(page).toContain("TRUST_PAGE_LOG");
    expect(page).toContain('href="/.well-known/security.txt"');
    expect(page).toContain('href="/privacy-policy"');
    expect(TRUST_PAGE_LOG[0].date).toBe("10 Oct 2026");
  });

  it("names xAI (Grok) on the page and does not claim a credential that is not held", () => {
    const facts = read("src/lib/trust-facts.ts");
    const page = read("src/app/trust/page.tsx");
    const blob = `${facts}\n${page}\n${AI_PROVIDER_API_SENTENCE}`;
    const taxWord = ["G", "ST"].join("");
    expect(blob).not.toContain(taxWord);
    expect(facts).not.toMatch(/\b(SuperGrok|Grok|xAI|Claude|Gemini|GPT-\d|ZENITH|ULTRA)\b/);
    expect(page).toContain("AI_PROVIDER_API_SENTENCE");
    expect(page).toContain("nameAiProvider");
    expect(page).toContain("only after you accept analytics cookies");
    expect(AI_PROVIDER_API_SENTENCE).toContain(`${AI_PROVIDER_NAME}, through its API`);
    expect(AI_PROVIDER_API_SENTENCE).not.toContain("in those sentences");
    expect(AI_PROVIDER_API_SENTENCE).toContain("up to 30 days");
    expect(AI_PROVIDER_API_SENTENCE).not.toMatch(/grok-\d|zero data retention/i);
    const stripped = `${page}\n${AI_PROVIDER_API_SENTENCE}`.replaceAll(AI_PROVIDER_NAME, "").replaceAll("xAI's", "");
    expect(stripped).not.toMatch(/\b(SuperGrok|Grok|xAI|Claude|Gemini|GPT-\d|ZENITH|ULTRA|grok-\d)\b/);
    expect(blob).not.toMatch(/2FA|two-factor|TOTP|SOC 2|penetration test|encryption at rest/i);
    expect(`${facts}\n${page}`).not.toMatch(/\breal-time\b|\bofficial\b|\blicensed\b/i);
  });
});
