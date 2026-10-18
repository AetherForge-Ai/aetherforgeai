/**
 * Facts the trust page may state. Each sentence is taken from a header,
 * a processor row, the AI request lines, the privacy policy, or security.txt.
 * No hosting region. No security credential. The page names the AI provider.
 * This module does not.
 *
 * pull-check:batch2-2026-10-11 B2-5
 */

import { AI_REQUEST_LINES, LEDGER_EXPORT_LINE, PROCESSORS } from "@/lib/public-copy";
import { SECURITY_HEADERS } from "@/lib/security-headers";

export const TRUST_HSTS = "max-age=31536000; includeSubDomains";

export const TRUST_STORAGE_NAME = "Totalum on Google Cloud";

export const TRUST_RETENTION_PHRASE = "Our code does not write the text of these requests to its logs";

/** Phrases copied from the privacy policy. The test checks each one is still there. */
export const TRUST_PRIVACY_PHRASES = [
  "encryption in transit",
  "only for as long as it is required for the purposes set out",
  "securely delete or de-identify",
  "You may delete your holdings at any time, and you may request deletion of your account.",
  "generally 20 working days",
  "notifiable privacy breach",
  "Office of the Privacy Commissioner",
] as const;

export const TRUST_SECURITY_TXT_CONTACT = "mailto:admin@aetherforgeai.co.nz";
export const TRUST_SECURITY_TXT_EXPIRES = "2027-10-08T00:00:00.000Z";

export const TRUST_PAGE_LOG = [
  {
    date: "10 Oct 2026",
    change:
      "Transport header, storage name, AI retention, deletion, export and breach contact, each matching the privacy policy.",
  },
  {
    date: "11 Oct 2026",
    change: "The AI provider is named on this page.",
  },
  {
    date: "13 Oct 2026",
    change:
      "The provider row uses the 30-day API wording. Google Analytics is described as running only after analytics cookies are accepted.",
  },
  {
    date: "16 Oct 2026",
    change:
      "Added the data sources and delay table, where the site runs, and a retention statement for AI requests.",
  },
  {
    date: "18 Oct 2026",
    change:
      "CoinPaprika is named with the other crypto price sources. The news list adds CoinDesk, Cointelegraph, CryptoCompare, and the Yahoo Finance Bitcoin and Ethereum headlines.",
  },
] as const;

/** H-15: where the site runs. Cloudflare serves pages; Totalum (Google Cloud) stores the book. */
export const TRUST_HOSTING_LINE =
  "Pages and APIs run on Cloudflare's global network. The paper book and account data are stored by Totalum on Google Cloud. Traffic is encrypted in transit (HTTPS with HSTS).";

export function trustTransportLine(): string {
  const hsts = SECURITY_HEADERS["Strict-Transport-Security"];
  if (hsts !== TRUST_HSTS) return "";
  return `The site response sets Strict-Transport-Security to ${TRUST_HSTS}.`;
}

export function trustStorageLine(): string {
  const row = PROCESSORS().find((processor) => processor.name === TRUST_STORAGE_NAME);
  if (!row) return "";
  return `${row.name} handles ${row.role}.`;
}

export function trustAiRetentionLine(): string {
  return AI_REQUEST_LINES.find((line) => line.includes(TRUST_RETENTION_PHRASE)) ?? "";
}

export function trustDeletionLine(): string {
  return "You may delete your holdings at any time, and you may request deletion of your account. Access and correction requests are answered within the timeframes in the Privacy Act 2020, generally 20 working days.";
}

export function trustRetentionLine(): string {
  return "Personal information is kept only for as long as it is required for the purposes set out in the privacy policy or as required by law. When information is no longer needed, it is securely deleted or de-identified.";
}

export function trustBreachLine(): string {
  return "security.txt lists Contact mailto:admin@aetherforgeai.co.nz and Expires 2027-10-08. A notifiable privacy breach is reported to affected people and the Office of the Privacy Commissioner, as the privacy policy states.";
}

export function trustExportLine(): string {
  return LEDGER_EXPORT_LINE;
}
