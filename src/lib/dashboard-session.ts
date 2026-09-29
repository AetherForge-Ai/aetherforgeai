/**
 * Session payload the dashboard is allowed to paint.
 * Built only from GET /api/session for the browser that holds the cookie.
 * The server page does not embed this into the HTML.
 */

export interface DashboardSessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  greetingName: string;
  metalsEntitled: boolean;
  subscription: {
    status?: string | null;
    plan?: string | null;
    startedAt?: string | null;
    expiresAt?: string | null;
    tickerLimit?: number | null;
    botAccess: "stock" | "crypto" | "both" | "none";
  };
}

function botAccess(value: unknown): DashboardSessionUser["subscription"]["botAccess"] {
  if (value === "stock" || value === "crypto" || value === "both" || value === "none") return value;
  return "none";
}

/** Accept a session envelope. Missing id or email is signed out — never a partial book. */
export function parseDashboardSessionUser(data: unknown): DashboardSessionUser | null {
  if (!data || typeof data !== "object") return null;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const row = user as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || typeof row.email !== "string" || !row.email) return null;
  const sub =
    row.subscription && typeof row.subscription === "object"
      ? (row.subscription as Record<string, unknown>)
      : {};
  const status =
    typeof sub.status === "string"
      ? sub.status
      : typeof row.subscription_status === "string"
        ? row.subscription_status
        : null;
  const plan =
    typeof sub.plan === "string"
      ? sub.plan
      : typeof row.subscription_plan === "string"
        ? row.subscription_plan
        : null;
  return {
    id: row.id,
    email: row.email,
    name: typeof row.name === "string" && row.name ? row.name : row.email,
    image: typeof row.image === "string" ? row.image : null,
    subscription_status: typeof row.subscription_status === "string" ? row.subscription_status : status,
    subscription_plan: typeof row.subscription_plan === "string" ? row.subscription_plan : plan,
    greetingName: typeof row.greetingName === "string" ? row.greetingName : "",
    metalsEntitled: row.metalsEntitled === true,
    subscription: {
      status,
      plan,
      startedAt: typeof sub.startedAt === "string" ? sub.startedAt : null,
      expiresAt: typeof sub.expiresAt === "string" ? sub.expiresAt : null,
      tickerLimit: typeof sub.tickerLimit === "number" ? sub.tickerLimit : null,
      botAccess: botAccess(sub.botAccess),
    },
  };
}
