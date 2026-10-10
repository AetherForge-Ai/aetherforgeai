/**
 * Welcome, report, trade and product notes.
 * Preview and log only. activityEmailSendingEnabled() is hard-off.
 * An environment variable cannot turn sending on. Nothing here contacts a mailbox.
 */

import { formatDisplayDate, formatNzd } from "@/lib/currency";
import { DEFAULT_EMAIL_PREFS, type EmailPrefs } from "@/lib/notification-prefs";

export const ACTIVITY_EMAIL_FROM = "noreply@aetherforgeai.co.nz";
export const ACTIVITY_EMAIL_FROM_NAME = "AetherForge AI";
export const ACTIVITY_EMAIL_REPLY_TO = "admin@aetherforgeai.co.nz";

/**
 * DNS Lukas needs before any branded send. Placeholders only.
 * The mailbox host supplies the real SPF include and the DKIM public key.
 * Do not put a private key in the repo, and do not send until each send is approved.
 */
export const BRANDED_SENDER_DNS = [
  {
    record: "TXT",
    host: "aetherforgeai.co.nz",
    purpose: "SPF",
    value: "v=spf1 include:<mailbox-host> -all",
    note: "One SPF record only. Merge with any SPF already on the apex. A second TXT SPF record will fail.",
  },
  {
    record: "TXT",
    host: "<selector>._domainkey.aetherforgeai.co.nz",
    purpose: "DKIM",
    value: "v=DKIM1; k=rsa; p=<public key from the mailbox host>",
    note: "The private key stays with the mailbox host. It must not be committed.",
  },
  {
    record: "TXT",
    host: "_dmarc.aetherforgeai.co.nz",
    purpose: "DMARC",
    value: "v=DMARC1; p=none; rua=mailto:admin@aetherforgeai.co.nz; adkim=s; aspf=s",
    note: "Start at p=none. Move to quarantine only after the reports look clean. Reports go to the existing admin mailbox.",
  },
] as const;

export type ActivityEmailKind = "welcome" | "report-ready" | "trade-ledger" | "weekly-summary" | "product-news";

export interface ActivityEmailPreview {
  sent: false;
  mode: "preview";
  reason: "preference-off" | "sending-off";
  kind: ActivityEmailKind;
  to: string;
  from: string;
  fromName: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
}

/** Always false. Sending is not wired and must not be turned on from here. */
export function activityEmailSendingEnabled(): boolean {
  return false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "redacted";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function preferenceAllows(kind: ActivityEmailKind, prefs: EmailPrefs): boolean {
  if (kind === "welcome" || kind === "product-news") return prefs.productNews;
  if (kind === "report-ready") return prefs.reportReady;
  if (kind === "trade-ledger") return prefs.tradeLedger;
  return prefs.weeklySummary;
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return formatNzd(0);
  return formatNzd(value);
}

export function renderActivityEmail(input: {
  kind: ActivityEmailKind;
  to: string;
  name?: string | null;
  reportTitle?: string | null;
  tradeLabel?: string | null;
  amountNzd?: number | null;
  when?: Date | string | null;
}): Omit<ActivityEmailPreview, "sent" | "mode" | "reason"> {
  const name = (input.name || "there").trim() || "there";
  const when = formatDisplayDate(input.when ?? new Date());
  const lines: string[] = [];
  let subject = "AetherForge AI";

  if (input.kind === "welcome") {
    subject = "Welcome to AetherForge AI";
    lines.push(
      `Kia ora ${name},`,
      "Your AetherForge AI paper book is ready.",
      "You record cash, buys, sells, corrections and dividends in NZ$. Real trades happen at your broker. We never move money.",
      `This note was prepared on ${when}. It was not sent.`,
    );
  } else if (input.kind === "report-ready") {
    const title = (input.reportTitle || "Your report").trim();
    subject = `Report saved — ${title}`;
    lines.push(
      `Kia ora ${name},`,
      `${title} was saved on your paper book on ${when}.`,
      "Open the dashboard to read it. Report emails are prepared only for books with positions, and sending is off.",
      "This note was not sent.",
    );
  } else if (input.kind === "trade-ledger") {
    const label = (input.tradeLabel || "Paper book entry").trim();
    subject = `Paper book updated — ${label}`;
    lines.push(
      `Kia ora ${name},`,
      `${label} was recorded on ${when}.`,
      `Cash on the book after this entry: ${money(input.amountNzd)}. The fee on a new paper trade defaults to ${formatNzd(0)}.`,
      "This is a paper book. We never move money.",
      "This note was not sent.",
    );
  } else if (input.kind === "weekly-summary") {
    subject = `Paper book summary — ${when}`;
    lines.push(
      `Kia ora ${name},`,
      `Weekly summary prepared on ${when}.`,
      "Figures on the paper book are in NZ$. This note was not sent.",
    );
  } else {
    subject = "News from AetherForge AI";
    lines.push(
      `Kia ora ${name},`,
      "A product note was prepared for your paper book.",
      "This note was not sent.",
    );
  }

  const text = lines.join("\n\n");
  return {
    kind: input.kind,
    to: input.to,
    from: ACTIVITY_EMAIL_FROM,
    fromName: ACTIVITY_EMAIL_FROM_NAME,
    replyTo: ACTIVITY_EMAIL_REPLY_TO,
    subject,
    html: `<p>${lines.map((line) => escapeHtml(line)).join("</p><p>")}</p>`,
    text,
  };
}

/**
 * Builds the message and writes one log line. Never sends.
 * `sent` is false even when the preference is on.
 */
export function previewActivityEmail(input: {
  kind: ActivityEmailKind;
  to: string;
  name?: string | null;
  prefs?: EmailPrefs | null;
  reportTitle?: string | null;
  tradeLabel?: string | null;
  amountNzd?: number | null;
  when?: Date | string | null;
}): ActivityEmailPreview {
  const prefs = input.prefs ?? DEFAULT_EMAIL_PREFS;
  const message = renderActivityEmail(input);
  const allowed = preferenceAllows(input.kind, prefs);
  if (activityEmailSendingEnabled()) {
    console.error("[activity-email] refusing to send; the preview flag must stay off");
  }
  const preview: ActivityEmailPreview = {
    sent: false,
    mode: "preview",
    reason: allowed ? "sending-off" : "preference-off",
    ...message,
  };
  console.log(
    `[activity-email] ${preview.reason} ${preview.kind} subject="${preview.subject}" to=${redactEmail(preview.to)} from=${preview.from}`,
  );
  return preview;
}
