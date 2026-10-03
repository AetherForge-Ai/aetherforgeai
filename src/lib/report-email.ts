/**
 * A report card may say "Emailed" only when the send API accepted the message.
 * The Totalum client returns `{ errors, data: null }` for a rejected payload
 * and does not throw. A stored `emailed: "yes"` without this proof is not delivery.
 */

export function reportEmailWasDelivered(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const row = result as { errors?: unknown; data?: unknown; success?: unknown; messageId?: unknown };
  if (row.errors) return false;
  const payload =
    row.data && typeof row.data === "object"
      ? (row.data as { success?: unknown; messageId?: unknown; errors?: unknown })
      : row;
  if ("errors" in payload && payload.errors) return false;
  if (payload.success !== true) return false;
  return typeof payload.messageId === "string" && payload.messageId.length > 0;
}

export function reportPayloadWasEmailed(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  return (payload as { emailDelivered?: unknown }).emailDelivered === true;
}
