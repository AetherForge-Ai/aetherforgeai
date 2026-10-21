/**
 * H-4/signup: the Totalum `user` table's column types (read from Totalum on 21 Oct 2026).
 * The user create is coerced to these types before it is sent, so a boolean, number or
 * Date never reaches a column of another type.
 * Options columns are sent as strings. Their allowed values live in Totalum and are not checked here.
 */
export const USER_COLUMN_TYPES: Record<string, "text" | "number" | "options" | "date"> = {
  name: "text", image: "text", stripe_customer_id: "text", country: "text",
  age_confirmed: "text", terms_version: "text", terms_accepted_at: "text",
  email: "text", first_name: "text", last_name: "text", phone: "text", secondary_email: "text",
  email_verified: "number", ticker_limit: "number", cash_balance: "number", wealth_goal_nzd: "number",
  subscription_status: "options", subscription_plan: "options", onboarded: "options",
  bot_access: "options", trial_used: "options",
  subscription_started_at: "date", subscription_expires_at: "date", trial_used_at: "date",
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (t === "true" || t === "yes") return 1;
    if (t === "false" || t === "no" || t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  return undefined;
}

function toDate(value: unknown): string | undefined {
  const d = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
}

/** Coerce a snake_case user row to the Totalum column types. Null/undefined keys are dropped. */
export function coerceUserRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    const type = USER_COLUMN_TYPES[key];
    let next: unknown = value;
    if (type === "number") next = toNumber(value);
    else if (type === "text" || type === "options") next = toText(value);
    else if (type === "date") next = toDate(value);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/** a@example.test -> a***@example.test. Anything email-shaped inside a string is masked. */
export function redactEmails(text: string): string {
  return text.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, "$1***@$2");
}

/** Totalum's error text, with emails masked, for the server log. */
export function totalumErrorText(error: unknown): string {
  let raw = "";
  try {
    if (error instanceof Error) {
      const extra = (error as { errorCode?: unknown; multipleErrors?: unknown });
      raw = `${error.name}: ${error.message} ${extra.errorCode ?? ""} ${extra.multipleErrors ? JSON.stringify(extra.multipleErrors) : ""}`;
    } else raw = typeof error === "string" ? error : JSON.stringify(error ?? null);
  } catch {
    raw = String(error);
  }
  return redactEmails(raw).slice(0, 500).trim();
}
