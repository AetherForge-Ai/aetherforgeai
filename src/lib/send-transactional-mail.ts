import "server-only";
import type { EmailPayloadI } from "totalum-api-sdk";
import { totalumSdk } from "@/lib/totalum";
import { prepareOutboundMail, type OutboundMail } from "@/lib/transactional-mail";

/**
 * Posts one message using only documented EmailPayloadI fields.
 * `text` is kept off the payload. sendEmail does not throw: a missing result
 * or `errors` is a failure so callers do not log a send that Totalum rejected.
 */
export async function sendTransactionalEmail(mail: OutboundMail) {
  const prepared = prepareOutboundMail(mail);
  const payload: EmailPayloadI = {
    to: prepared.to,
    subject: prepared.subject,
    html: prepared.html,
    ...(prepared.fromName ? { fromName: prepared.fromName } : {}),
    ...(prepared.replyTo ? { replyTo: prepared.replyTo } : {}),
    ...(prepared.cc ? { cc: prepared.cc } : {}),
    ...(prepared.bcc ? { bcc: prepared.bcc } : {}),
    ...(prepared.attachments ? { attachments: prepared.attachments } : {}),
  };
  const result = await totalumSdk.email.sendEmail(payload);
  if (result == null) {
    throw new Error("Email sender returned no result.");
  }
  if (result.errors) {
    const message = result.errors.errorMessage?.trim();
    throw new Error(message || "Email sender rejected the message.");
  }
  return result;
}
