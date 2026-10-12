/**
 * Live reads and the existing transactional sender for the annual reminder.
 * Nothing here adds a database column.
 */

import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { sendTransactionalEmail } from "@/lib/send-transactional-mail";
import { CUSTOMER_EMAIL } from "@/lib/public-copy";
import type { RenewalReminderCandidate, RenewalReminderMail } from "@/lib/renewal-reminder";

const SCAN_LIMIT = 400;

export function candidateFromUserRow(row: Record<string, unknown>): RenewalReminderCandidate {
  return {
    id: String(row._id || row.id || ""),
    email: typeof row.email === "string" ? row.email : "",
    emailVerified: row.email_verified ?? row.emailVerified,
    subscriptionStatus: typeof row.subscription_status === "string" ? row.subscription_status : null,
    subscriptionPlan: typeof row.subscription_plan === "string" ? row.subscription_plan : null,
    subscriptionExpiresAt:
      typeof row.subscription_expires_at === "string" ? row.subscription_expires_at : null,
  };
}

export async function loadRenewalReminderCandidates(): Promise<RenewalReminderCandidate[]> {
  const res = await totalumSdk.crud.query("user", {
    _filter: { subscription_status: "active" },
    _limit: SCAN_LIMIT,
  });
  const rows = ((res as { data?: Record<string, unknown>[] })?.data || []) as Record<string, unknown>[];
  return rows.map(candidateFromUserRow).filter((row) => row.id);
}

export async function deliverRenewalReminder(mail: RenewalReminderMail): Promise<void> {
  await sendTransactionalEmail({
    to: [mail.to],
    subject: mail.subject,
    html: mail.html,
    fromName: "AetherForge AI",
    replyTo: CUSTOMER_EMAIL,
  });
}
