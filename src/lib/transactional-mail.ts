/**
 * Bodies for Totalum `email.sendEmail`.
 *
 * totalum-api-sdk 3.0.8 `EmailPayloadI` (EmailService.d.ts) names the HTML
 * field `html` and has no `text` field. `EmailService.sendEmail` still posts
 * the whole object, so a `text` property is delivered beside `html`.
 *
 * Inline `style` attributes are stripped before delivery (see
 * totalum-docs/totalum-sdk/10-send-emails.md). The verification and reset
 * templates were only those attributes, with no plain-text part, so the
 * message that arrived was `text/plain` with an empty body.
 */

export interface MailAttachment {
  filename: string;
  url: string;
  contentType?: string;
}

export interface OutboundMail {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: MailAttachment[];
  /** Posted for the product note. The SDK type list does not include it. */
  from?: string;
}

export interface PreparedMail extends Omit<OutboundMail, "text"> {
  html: string;
  text: string;
}

const PRODUCTION_ORIGIN = "https://aetherforgeai.co.nz";

export function absoluteAuthUrl(url: string, base?: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const origin = (base || process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_ORIGIN).replace(/\/$/, "");
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${origin}${path}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainName(name?: string | null): string {
  return (name || "").replace(/\s+/g, " ").trim();
}

/** Drop inline style attributes. Keep `<style>` blocks, classes, and text. */
export function stripInlineStyles(html: string): string {
  return html.replace(/\sstyle\s*=\s*"[^"]*"/gi, "").replace(/\sstyle\s*=\s*'[^']*'/gi, "");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function htmlToText(html: string): string {
  const withoutStyle = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const withLinks = withoutStyle.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_full, doubleQuoted: string, singleQuoted: string, bare: string, labelHtml: string) => {
      const href = decodeEntities((doubleQuoted || singleQuoted || bare || "").trim());
      const label = decodeEntities(labelHtml.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (!href) return label;
      if (!label || label === href) return href;
      return `${label}\n${href}`;
    },
  );
  return decodeEntities(withLinks)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|h4|div|tr|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function prepareOutboundMail(mail: OutboundMail): PreparedMail {
  const html = stripInlineStyles(mail.html).trim();
  const text = (mail.text || "").trim() || htmlToText(html);
  if (!html || !text) {
    throw new Error("Transactional email is missing a body.");
  }
  return { ...mail, html, text };
}

function greeting(name?: string | null): string {
  const who = plainName(name);
  return who ? `Hi ${who},` : "Hi,";
}

function shell(heading: string, hello: string, paragraphs: string[], linkLabel: string, url: string): string {
  const body = paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n  ");
  return `<style>
  .mail { font-family: Georgia, "Times New Roman", serif; color: #1c1917; line-height: 1.5; }
  a { color: #1d4e89; }
</style>
<div class="mail">
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(hello)}</p>
  ${body}
  <p><a href="${escapeHtml(url)}">${escapeHtml(linkLabel)}</a></p>
  <p>${escapeHtml(url)}</p>
</div>`;
}

/** pull-check:verification-email-html-and-text */
export function verificationEmail(input: { to: string; name?: string | null; url: string }): PreparedMail {
  const url = absoluteAuthUrl(input.url);
  const hello = greeting(input.name);
  const lines = [
    "Open this link to activate your AetherForge AI account:",
    `Verify My Email: ${url}`,
    "",
    "If you did not create an account, you can ignore this email.",
  ];
  return prepareOutboundMail({
    to: [input.to],
    subject: "Verify your email to activate AetherForge AI",
    fromName: "AetherForge AI",
    html: shell(
      "Confirm your email address",
      hello,
      ["Open this link to activate your AetherForge AI account.", "If you did not create an account, you can ignore this email."],
      "Verify My Email",
      url,
    ),
    text: ["Confirm your email address", "", hello, "", ...lines].join("\n"),
  });
}

export function passwordResetEmail(input: { to: string; name?: string | null; url: string }): PreparedMail {
  const url = absoluteAuthUrl(input.url);
  const hello = greeting(input.name);
  const lines = [
    "We received a request to reset the password for your AetherForge AI account.",
    "Open this link to choose a new password. It expires in 1 hour:",
    url,
    "",
    "If you did not request this, you can ignore this email. Your password will stay the same.",
  ];
  return prepareOutboundMail({
    to: [input.to],
    subject: "Reset your AetherForge password",
    fromName: "AetherForge AI",
    html: shell(
      "Reset your password",
      hello,
      [
        "We received a request to reset the password for your AetherForge AI account.",
        "Open this link to choose a new password. It expires in 1 hour.",
        "If you did not request this, you can ignore this email. Your password will stay the same.",
      ],
      "Reset Password",
      url,
    ),
    text: ["Reset your password", "", hello, "", ...lines].join("\n"),
  });
}
