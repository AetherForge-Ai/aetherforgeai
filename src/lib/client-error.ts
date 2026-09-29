/**
 * Decides which window "error" events are real script failures.
 * Resource load failures (coin icons, images) and empty/undefined throws
 * must not be logged as unhandled exceptions.
 */

export interface ClientErrorLike {
  error?: unknown;
  message?: unknown;
  filename?: unknown;
  /** Event target. Resource errors point at the element, not window. */
  target?: unknown;
}

const RESOURCE_TAGS = new Set(["IMG", "SCRIPT", "LINK", "VIDEO", "SOURCE", "AUDIO", "IMAGE"]);

function targetTag(target: unknown): string {
  if (!target || typeof target !== "object") return "";
  const tag = (target as { tagName?: unknown }).tagName;
  return typeof tag === "string" ? tag.toUpperCase() : "";
}

export function isEmptyClientError(event: ClientErrorLike): boolean {
  if (event.error != null) return false;
  if (typeof event.message !== "string") return true;
  const message = event.message.trim().toLowerCase();
  return message === "" || message === "undefined" || message === "null" || message === "script error.";
}

/** Resource loads and undefined/empty errors are not actionable script exceptions. */
export function shouldIgnoreClientError(event: ClientErrorLike): boolean {
  const tag = targetTag(event.target);
  if (tag && RESOURCE_TAGS.has(tag)) return true;
  return isEmptyClientError(event);
}

export function clientErrorSummary(event: ClientErrorLike): string {
  if (event.error instanceof Error && event.error.message) return event.error.message;
  if (typeof event.message === "string" && event.message.trim()) return event.message.trim();
  return "Unknown client error";
}
