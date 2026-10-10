/**
 * Email choices for the paper book. Stored on this browser.
 * They do not send mail. Sending stays off until Lukas approves each send.
 */

export const EMAIL_PREFS_COOKIE = "af_email_prefs";

export interface EmailPrefs {
  reportReady: boolean;
  tradeLedger: boolean;
  weeklySummary: boolean;
  productNews: boolean;
}

export const DEFAULT_EMAIL_PREFS: EmailPrefs = {
  reportReady: false,
  tradeLedger: false,
  weeklySummary: false,
  productNews: false,
};

export const EMAIL_PREF_FIELDS = [
  {
    key: "reportReady" as const,
    label: "Report ready",
    detail: "When a Stox or Koins report is saved on a book that has positions.",
  },
  {
    key: "tradeLedger" as const,
    label: "Trade and ledger",
    detail: "When a buy, sell, deposit, withdrawal or dividend is recorded.",
  },
  {
    key: "weeklySummary" as const,
    label: "Weekly summary",
    detail: "A short weekday note about the paper book.",
  },
  {
    key: "productNews" as const,
    label: "Product news",
    detail: "Product updates. The welcome note follows this choice.",
  },
];

function asBool(value: unknown): boolean {
  return value === true;
}

export function parseEmailPrefs(raw: string | null | undefined): EmailPrefs {
  if (!raw) return { ...DEFAULT_EMAIL_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<EmailPrefs>;
    return {
      reportReady: asBool(parsed.reportReady),
      tradeLedger: asBool(parsed.tradeLedger),
      weeklySummary: asBool(parsed.weeklySummary),
      productNews: asBool(parsed.productNews),
    };
  } catch {
    return { ...DEFAULT_EMAIL_PREFS };
  }
}

export function sanitizeEmailPrefs(input: unknown): EmailPrefs {
  const row = input && typeof input === "object" ? (input as Partial<EmailPrefs>) : {};
  return {
    reportReady: asBool(row.reportReady),
    tradeLedger: asBool(row.tradeLedger),
    weeklySummary: asBool(row.weeklySummary),
    productNews: asBool(row.productNews),
  };
}

export function serializeEmailPrefs(prefs: EmailPrefs): string {
  return JSON.stringify(sanitizeEmailPrefs(prefs));
}
