/**
 * CR-4: "Last updated" and "What changed" for every legal page, and the
 * /legal/archive list. Newest first. Plain English, no internal references.
 * TODO(owner) in public-copy.ts stays until an NZ lawyer signs off (BL-2).
 */
export type LegalPageKey = "terms" | "privacy" | "ai-disclaimer" | "refunds" | "cookies" | "contact";

export interface LegalVersion {
  date: string;
  changes: string[];
}

export const LEGAL_PAGES: Record<LegalPageKey, { title: string; href: string; versions: LegalVersion[] }> = {
  terms: {
    title: "Terms",
    href: "/terms-of-service",
    versions: [
      { date: "16 Oct 2026", changes: ["Every section has its own link.", "The disclaimer uses the same wording as the rest of the site."] },
      { date: "13 Oct 2026", changes: ["Re-issued Terms published."] },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    href: "/privacy-policy",
    versions: [
      { date: "16 Oct 2026", changes: ["Every section has its own link.", "Share projections are described the same way as on Pricing and Help."] },
      { date: "13 Oct 2026", changes: ["Re-issued Privacy Policy published."] },
    ],
  },
  "ai-disclaimer": {
    title: "AI Disclaimer",
    href: "/ai-disclaimer",
    versions: [
      { date: "16 Oct 2026", changes: ["The statement about financial advice law now matches every other page word for word.", "Every section has its own link."] },
      { date: "13 Oct 2026", changes: ["Re-issued AI Disclaimer published."] },
    ],
  },
  refunds: {
    title: "Refunds & Cancellations",
    href: "/refunds",
    versions: [
      { date: "16 Oct 2026", changes: ["Every section has its own link.", "/returns now goes straight to this page."] },
      { date: "13 Oct 2026", changes: ["The 14-day annual refund rule was published."] },
    ],
  },
  cookies: {
    title: "Cookies",
    href: "/cookies",
    versions: [
      { date: "16 Oct 2026", changes: ["Every section has its own link."] },
      { date: "13 Oct 2026", changes: ["Cookie list published."] },
    ],
  },
  contact: {
    title: "Contact",
    href: "/contact",
    versions: [
      { date: "16 Oct 2026", changes: ["Every section has its own link."] },
      { date: "15 Oct 2026", changes: ["The message form was added. No postal address is published."] },
    ],
  },
};

export function latestLegalVersion(key: LegalPageKey): LegalVersion {
  return LEGAL_PAGES[key].versions[0];
}

const LEGAL_STAMP_MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/**
 * The stamp LegalShell prints ("16 Oct 2026") as a sitemap lastmod day.
 * Same string the page shows; only the shape changes.
 */
export function legalStampToIso(stamp: string): string {
  const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(stamp.trim());
  const month = match ? LEGAL_STAMP_MONTHS[match[2][0].toUpperCase() + match[2].slice(1).toLowerCase()] : undefined;
  if (!match || !month) throw new Error(`Legal date must look like "16 Oct 2026": ${stamp}`);
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

/** Stable anchor id for a section heading: "1. Information only — not financial advice" → "information-only-not-financial-advice". */
export function legalAnchorId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/^\s*\d+(\.\d+)*[.)]?\s*/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
