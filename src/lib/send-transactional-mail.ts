import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { prepareOutboundMail, type OutboundMail, type PreparedMail } from "@/lib/transactional-mail";

/**
 * Sends one transactional message with both the HTML part (`html`, the field
 * EmailPayloadI actually posts) and a plain-text part (`text`).
 */
export async function sendTransactionalEmail(mail: OutboundMail) {
  const prepared: PreparedMail = prepareOutboundMail(mail);
  const payload = {
    to: prepared.to,
    subject: prepared.subject,
    html: prepared.html,
    text: prepared.text,
    ...(prepared.fromName ? { fromName: prepared.fromName } : {}),
    ...(prepared.replyTo ? { replyTo: prepared.replyTo } : {}),
    ...(prepared.cc ? { cc: prepared.cc } : {}),
    ...(prepared.bcc ? { bcc: prepared.bcc } : {}),
    ...(prepared.attachments ? { attachments: prepared.attachments } : {}),
    ...(prepared.from ? { from: prepared.from } : {}),
  };
  return totalumSdk.email.sendEmail(payload);
}
