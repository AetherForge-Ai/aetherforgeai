import "server-only";
import { totalumSdk } from "@/lib/totalum";
import {
  SUPPORT_EMAIL,
  WELCOME_SUBJECT,
  appBase,
  emailSendAccepted,
  reportEmailHtml,
  welcomeEmailHtml,
} from "@/lib/member-email-copy";

function publicAppUrl(): string {
  return appBase(process.env.NEXT_PUBLIC_APP_URL || "https://aetherforgeai.co.nz");
}

export async function sendHtmlEmail(input: {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; url: string; contentType: string }>;
}): Promise<boolean> {
  try {
    const result = await totalumSdk.email.sendEmail({
      to: [input.to],
      subject: input.subject,
      html: input.html,
      fromName: "AetherForge AI",
      replyTo: SUPPORT_EMAIL,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    });
    const accepted = emailSendAccepted(result);
    console.log(`[member-email] send to ${input.to} accepted=${accepted}`);
    return accepted;
  } catch (err) {
    console.error(`[member-email] send to ${input.to} failed:`, err);
    return false;
  }
}

/** Signup welcome. Failures are logged and do not reject account creation. */
export async function sendWelcomeEmail(user: { email: string; name?: string | null }): Promise<boolean> {
  return sendHtmlEmail({
    to: user.email,
    subject: WELCOME_SUBJECT,
    html: welcomeEmailHtml({ name: user.name, appUrl: publicAppUrl() }),
  });
}

export async function sendReportEmail(input: {
  to: string;
  subject: string;
  title: string;
  summary: string;
  botLabel: string;
  generatedAt: string;
  pdfUrl?: string | null;
}): Promise<boolean> {
  const html = reportEmailHtml({
    title: input.title,
    summary: input.summary,
    appUrl: publicAppUrl(),
    generatedAt: input.generatedAt,
    botLabel: input.botLabel,
  });
  const attachment =
    input.pdfUrl && input.pdfUrl.startsWith("http")
      ? [{ filename: `${input.title}.pdf`, url: input.pdfUrl, contentType: "application/pdf" }]
      : undefined;
  const withFile = await sendHtmlEmail({
    to: input.to,
    subject: input.subject,
    html,
    attachments: attachment,
  });
  if (withFile || !attachment) return withFile;
  console.error(`[member-email] Report send with PDF failed for ${input.to}; retrying without the attachment`);
  return sendHtmlEmail({ to: input.to, subject: input.subject, html });
}
