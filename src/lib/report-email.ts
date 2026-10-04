/**
 * A report card may say "Emailed" only when the send API accepted the message.
 * The Totalum client returns `{ errors, data: null }` for a rejected payload
 * and does not throw. A stored `emailed: "yes"` without this proof is not delivery.
 */

export function reportEmailMessageId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const row = result as { errors?: unknown; data?: unknown; success?: unknown; messageId?: unknown };
  if (row.errors) return null;
  const payload =
    row.data && typeof row.data === "object"
      ? (row.data as { success?: unknown; messageId?: unknown; errors?: unknown })
      : row;
  if ("errors" in payload && payload.errors) return null;
  if (payload.success !== true) return null;
  return typeof payload.messageId === "string" && payload.messageId.length > 0 ? payload.messageId : null;
}

export function reportEmailWasDelivered(result: unknown): boolean {
  return reportEmailMessageId(result) != null;
}

/** Saved is not emailed. The card needs a real send and the message id it returned. */
export function reportPayloadWasEmailed(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as { emailDelivered?: unknown; emailMessageId?: unknown };
  return row.emailDelivered === true && typeof row.emailMessageId === "string" && row.emailMessageId.length > 0;
}
