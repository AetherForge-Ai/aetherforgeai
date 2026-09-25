import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { totalumSdk } from "@/lib/totalum";
import { userRecordConflicts } from "@/lib/account-guard";
import {
  cookieHeaderForStableRead,
  hasSessionDataCookie,
  sessionFlightKey,
  type SessionReadMode,
} from "@/lib/session-owner";

export type BotAccessValue = "stock" | "crypto" | "both" | "none";

export interface AppUser {
  _id: string;
  id: string;
  email: string;
  name: string;
  image?: string | null;
  stripe_customer_id?: string | null;
  subscription_status?: "active" | "canceled" | "past_due" | "none" | null;
  subscription_plan?: "free" | "weekly" | "monthly" | "yearly" | "dual_yearly" | "none" | null;
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  ticker_limit?: number | null;
  bot_access?: BotAccessValue | null;
  /** "yes" once the user has consumed their one-time free-trial Zenith report. */
  trial_used?: "yes" | "no" | null;
  trial_used_at?: string | null;
  /** Investable cash balance in NZD, adjusted by buy/sell/deposit/withdraw. */
  cash_balance?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  country?: string | null;
  phone?: string | null;
  secondary_email?: string | null;
  /**
   * True when the Totalum user record id did not match the session user.
   * Callers must not return that record's cash or ledger.
   */
  identityConflict?: boolean;
}

const inflightSessions = new Map<string, Promise<Awaited<ReturnType<typeof auth.api.getSession>>>>();

/**
 * One in-flight session read per cookie and mode. Concurrent API calls (Buy
 * confirm, a report compile, the crypto poll) must not each refresh and
 * overwrite the session cookie.
 *
 * Background polls pass refresh=false so a 401 there cannot rotate the token.
 * Their key stays `read:<token>`. Dashboard navigations use `strict:<token>`
 * (disableCookieCache) so they never share that promise or trust session_data.
 * The rotating key stays `refresh:<token>`.
 */
async function readSession(
  headerList: Headers,
  refresh: boolean,
  disableCookieCache = false,
  modeOverride?: SessionReadMode,
) {
  const mode: SessionReadMode =
    modeOverride ?? (refresh ? "refresh" : disableCookieCache ? "strict" : "read");
  const key = sessionFlightKey(headerList.get("cookie"), mode);
  const existing = inflightSessions.get(key);
  if (existing) return existing;
  const job = (
    refresh
      ? auth.api.getSession({ headers: headerList })
      : auth.api.getSession({
          headers: headerList,
          query: {
            disableRefresh: true,
            ...(disableCookieCache ? { disableCookieCache: true } : {}),
          },
        })
  ).finally(() => {
    if (inflightSessions.get(key) === job) inflightSessions.delete(key);
  });
  inflightSessions.set(key, job);
  return job;
}

/**
 * Returns the current session user merged with the full Totalum user record
 * (so subscription/billing fields are always present). Returns null if there
 * is no valid session.
 *
 * Session reads do not rotate the cookie unless `refreshSession` is explicitly
 * true. A rotating get-session deletes the token when the session touch fails,
 * and an in-flight refresh can overwrite the next paper book on a shared browser.
 * Non-rotating reads drop session_data before calling better-auth. A bad HMAC
 * returns null before `disableCookieCache` is consulted, and a valid cache can
 * name a different account than the session token.
 */
export async function getCurrentUser(opts?: {
  refreshSession?: boolean;
  disableCookieCache?: boolean;
}): Promise<AppUser | null> {
  try {
    const headerList = await headers();
    const refresh = opts?.refreshSession === true;
    const disableCookieCache = !refresh;
    let readHeaders: Headers = headerList;
    if (disableCookieCache && hasSessionDataCookie(headerList.get("cookie"))) {
      const stripped = new Headers(headerList);
      const cookie = cookieHeaderForStableRead(headerList.get("cookie"));
      if (cookie) stripped.set("cookie", cookie);
      else stripped.delete("cookie");
      readHeaders = stripped;
    }
    const session = await readSession(
      readHeaders,
      refresh,
      disableCookieCache,
      disableCookieCache ? "strict-db" : undefined,
    );
    if (!session?.user?.id) return null;

    const userId = session.user.id;
    let record: any = null;
    try {
      const res = await totalumSdk.crud.getRecordById("user", userId);
      record = (res as any)?.data ?? null;
    } catch (err) {
      console.error("[session] Failed to load full user record:", err);
    }

    // Session id is the source of truth. A record whose own id disagrees
    // belongs to another account — never copy its cash_balance onto this user.
    const identityConflict = userRecordConflicts(userId, record);
    if (identityConflict) {
      console.error("[session] Refusing user record that does not match session", {
        sessionUserId: userId,
        recordId: record?._id ?? record?.id,
      });
      record = null;
    }

    return {
      _id: userId,
      id: userId,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? record?.image ?? null,
      stripe_customer_id: record?.stripe_customer_id ?? null,
      subscription_status: record?.subscription_status ?? "none",
      subscription_plan: record?.subscription_plan ?? "none",
      subscription_started_at: record?.subscription_started_at ?? null,
      subscription_expires_at: record?.subscription_expires_at ?? null,
      ticker_limit: typeof record?.ticker_limit === "number" ? record.ticker_limit : null,
      bot_access: record?.bot_access ?? "none",
      trial_used: record?.trial_used ?? "no",
      trial_used_at: record?.trial_used_at ?? null,
      cash_balance: typeof record?.cash_balance === "number" ? record.cash_balance : 0,
      first_name: record?.first_name ?? (session.user as any).first_name ?? null,
      last_name: record?.last_name ?? (session.user as any).last_name ?? null,
      country: record?.country ?? (session.user as any).country ?? null,
      phone: record?.phone ?? (session.user as any).phone ?? null,
      secondary_email: record?.secondary_email ?? (session.user as any).secondary_email ?? null,
      identityConflict,
    };
  } catch (err) {
    console.error("[session] getCurrentUser error:", err);
    return null;
  }
}

/**
 * Read the session without rotating it and without trusting session_data.
 * Portfolio loads and confirmed trades use this so a just-issued login cookie
 * cannot 401 the book or clear the session.
 */
export function getStableSessionUser() {
  return getCurrentUser({ refreshSession: false, disableCookieCache: true });
}

/** Confirmed trades. Same read as {@link getStableSessionUser}. */
export function getTradeSessionUser() {
  return getStableSessionUser();
}

/** Whether Stripe billing is configured in this environment. */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** True when the user has an active subscription of ANY tier (incl. legacy free). */
export function hasActiveSubscription(user: AppUser | null): boolean {
  return user?.subscription_status === "active";
}

/** The paid (non-free) subscription tiers. */
const PAID_PLANS = [
  "weekly",
  "monthly",
  "yearly",
  "dual_yearly",
  "starter_monthly",
  "starter_yearly",
  "pro_monthly",
  "pro_yearly",
  "ultimate_monthly",
  "ultimate_yearly",
];

/**
 * True only for an active PAID subscription (excludes the free tier).
 * This is the gate that separates the permanent dashboard (paying members) from
 * the one-time free-trial experience (signed-up but not yet paying).
 */
export function hasPaidSubscription(user: AppUser | null): boolean {
  return user?.subscription_status === "active" && PAID_PLANS.includes(user?.subscription_plan || "");
}

/**
 * Eligibility for the ONE-TIME free-trial "Zenith" report: the user must be
 * signed in, NOT on an active PAID subscription, and must NOT have already
 * consumed their single trial run.
 */
export function isTrialEligible(user: AppUser | null): boolean {
  if (!user) return false;
  if (hasPaidSubscription(user)) return false;
  return user.trial_used !== "yes";
}
