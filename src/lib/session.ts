import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { totalumSdk } from "@/lib/totalum";
import { userRecordConflicts } from "@/lib/account-guard";
import { normalizePlanKey } from "@/lib/entitlements";
import { bookNotBeforeFromCookie } from "@/lib/book-write-mark";
import { cookieValue, sessionExpiresInFuture, verifySignedSessionToken } from "@/lib/session-token";

export type BotAccessValue = "stock" | "crypto" | "both" | "none";

export interface AppUser {
  _id: string;
  /** b26 G-10: ms timestamp of the live user read that produced cash_balance. */
  cash_read_at?: number;
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

type TokenSession = {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
  session: { expiresAt?: Date | string | number | null };
};

const inflightSessions = new Map<string, Promise<TokenSession | null>>();

/**
 * b29 H-4 root cause: every request made two Totalum reads (session row + user record) with no
 * reuse between requests. A /dashboard view fires ~10 API calls, each re-reading both, so under
 * TT's soak the store started timing out (4 s deadline). Timeouts became 503 "could not confirm"
 * on the page and null on the nav (header "Log in"), and Try again re-asked the same overloaded
 * store. Fix: a short per-isolate cache of the verified session row and user record, and when
 * the store is slow, the last good answer for the SAME signed token (still unexpired) instead of
 * "unavailable". A signed token is only valid with the server secret, so this never names
 * another browser's user.
 */
export const SESSION_CACHE_FRESH_MS = 60_000;
/** Serve the last good row for this token when the store fails, up to this age. */
export const SESSION_CACHE_STALE_MS = 30 * 60_000;
export const USER_RECORD_FRESH_MS = 20_000;
const SESSION_CACHE_MAX = 500;
const sessionCache = new Map<string, { at: number; row: TokenSession }>();
const recordCache = new Map<string, { at: number; record: any }>();

function rememberBounded<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key);
  map.set(key, value);
  if (map.size > SESSION_CACHE_MAX) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
}

/** Sign-out on this isolate: drop the cached row for the token so it is never served again. */
export function forgetCachedSessionToken(token: string | null | undefined): void {
  if (!token) return;
  sessionCache.delete(`token:${token}`);
}

export type SessionDecision = {
  route?: string;
  cookie: boolean;
  signature: boolean;
  source: "cache" | "store" | "stale-cache" | "none";
  storeMs: number | null;
  outcome: "user" | "signed-out" | "unavailable";
};
/** b29 H-4: last decisions on this isolate, so a production trace can be read from a test hook. */
const decisionLog: Array<SessionDecision & { at: string }> = [];
export function recordSessionDecision(d: SessionDecision): void {
  decisionLog.push({ ...d, at: new Date().toISOString() });
  if (decisionLog.length > 400) decisionLog.splice(0, decisionLog.length - 400);
  if (d.outcome !== "user" || d.source === "stale-cache") console.info("[session-decision]", JSON.stringify(d));
}
export function recentSessionDecisions() {
  return decisionLog.slice();
}

export function __resetSessionCacheForTests(): void {
  sessionCache.clear();
  recordCache.clear();
  inflightSessions.clear();
  decisionLog.length = 0;
}

/** b27 H-4: a session store read that failed or timed out. Not the same as signed out. */
export class SessionStoreUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`session store unavailable: ${reason}`);
  }
}
/** b27 H-4: no session read may hold a page for 25 s; 4 s then "unavailable, retry". */
export const SESSION_LOOKUP_TIMEOUT_MS = 4000;
function sessionDeadline<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new SessionStoreUnavailable(`${what} timeout ${SESSION_LOOKUP_TIMEOUT_MS} ms`)), SESSION_LOOKUP_TIMEOUT_MS);
    }),
  ]).finally(() => timer && clearTimeout(timer));
}

/**
 * Token-only session lookup. Does not call better-auth get-session.
 * That endpoint writes Set-Cookie: it deletes the token when the row looks
 * missing or a session touch fails, which is how UI Refresh signed the user out
 * after a successful Confirm. A miss here is just "no user" — the cookie stays.
 */
async function readTokenSession(cookieHeader: string | null): Promise<TokenSession | null> {
  const ctx = await auth.$context;
  const raw = cookieValue(cookieHeader, ctx.authCookies.sessionToken.name);
  if (!raw) {
    recordSessionDecision({ cookie: false, signature: false, source: "none", storeMs: null, outcome: "signed-out" });
    return null;
  }
  const token = await verifySignedSessionToken(raw, ctx.secret);
  if (!token) {
    recordSessionDecision({ cookie: true, signature: false, source: "none", storeMs: null, outcome: "signed-out" });
    return null;
  }
  const key = `token:${token}`;
  const cached = sessionCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < SESSION_CACHE_FRESH_MS && sessionExpiresInFuture(cached.row.session.expiresAt)) {
    recordSessionDecision({ cookie: true, signature: true, source: "cache", storeMs: 0, outcome: "user" });
    return cached.row;
  }
  const existing = inflightSessions.get(key);
  if (existing) return existing;
  const started = Date.now();
  const storeRead = sessionDeadline(
    Promise.resolve(ctx.internalAdapter.findSession(token)).catch((err: unknown) => {
      throw err instanceof SessionStoreUnavailable ? err : new SessionStoreUnavailable(`session read error: ${err instanceof Error ? err.message.slice(0, 80) : "error"}`);
    }),
    "session read"
  )
    .then((found) => {
      const row = found as TokenSession | null;
      const storeMs = Date.now() - started;
      if (!row?.user?.id || !row.session || !sessionExpiresInFuture(row.session.expiresAt)) {
        sessionCache.delete(key);
        recordSessionDecision({ cookie: true, signature: true, source: "store", storeMs, outcome: "signed-out" });
        return null;
      }
      rememberBounded(sessionCache, key, { at: Date.now(), row });
      recordSessionDecision({ cookie: true, signature: true, source: "store", storeMs, outcome: "user" });
      return row;
    }, (err: unknown) => {
      const storeMs = Date.now() - started;
      const last = sessionCache.get(key);
      if (last && Date.now() - last.at < SESSION_CACHE_STALE_MS && sessionExpiresInFuture(last.row.session.expiresAt)) {
        recordSessionDecision({ cookie: true, signature: true, source: "stale-cache", storeMs, outcome: "user" });
        return last.row;
      }
      recordSessionDecision({ cookie: true, signature: true, source: "store", storeMs, outcome: "unavailable" });
      throw err;
    });
  const job = storeRead
    .finally(() => {
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
 * Every read uses the signed session token and the database row.
 * `refreshSession` is accepted and ignored. Calling better-auth get-session
 * from a price refresh (or any other route) can delete `session_token`.
 * `session_data` is not consulted, so a stale cache cannot name another book
 * or null out a valid token.
 */
export async function getCurrentUser(_opts?: {
  refreshSession?: boolean;
  disableCookieCache?: boolean;
}): Promise<AppUser | null> {
  try {
    return await loadCurrentUser();
  } catch (err) {
    console.error("[session] getCurrentUser error:", err instanceof SessionStoreUnavailable ? err.reason : err);
    return null;
  }
}

/**
 * b27 H-4: the session state with "unavailable" kept apart from "signed out". /api/session
 * answers 503 for unavailable so the browser retries instead of showing the members gate.
 */
export async function getSessionState(): Promise<{ user: AppUser | null; unavailable: string | null }> {
  try {
    return { user: await loadCurrentUser(), unavailable: null };
  } catch (err) {
    const reason = err instanceof SessionStoreUnavailable ? err.reason : "unexpected error";
    console.warn("[session] lookup unavailable (not treated as signed out):", reason);
    return { user: null, unavailable: reason };
  }
}

async function loadCurrentUser(): Promise<AppUser | null> {
  {
    const headerList = await headers();
    const session = await readTokenSession(headerList.get("cookie"));
    if (!session?.user?.id) return null;

    const userId = session.user.id;
    let record: any = null;
    let recordReadAt: number | undefined;
    // A browser that just wrote (af_bw stamp) never gets a record read before its write: cash moved.
    const writtenNotBefore = bookNotBeforeFromCookie(headerList.get("cookie"));
    const cachedRecord = recordCache.get(userId);
    if (cachedRecord && Date.now() - cachedRecord.at < USER_RECORD_FRESH_MS && cachedRecord.at >= writtenNotBefore) {
      record = cachedRecord.record;
      recordReadAt = cachedRecord.at;
    } else {
      try {
        const res = await sessionDeadline(totalumSdk.crud.getRecordById("user", userId), "user record");
        record = (res as any)?.data ?? null;
        recordReadAt = Date.now();
        if (record) rememberBounded(recordCache, userId, { at: recordReadAt, record });
      } catch (err) {
        // b29 H-4: a slow user-record read with a known record is not an outage.
        if (cachedRecord && Date.now() - cachedRecord.at < SESSION_CACHE_STALE_MS) {
          record = cachedRecord.record;
          recordReadAt = cachedRecord.at;
        } else {
          if (err instanceof SessionStoreUnavailable) throw err;
          console.error("[session] Failed to load full user record:", err);
        }
      }
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
      // b26 G-10: when the cash came from a live read, writes in this request reuse it.
      // b29: the time of the read that produced it (a cached record is older, so writes re-read).
      cash_read_at: record && typeof record.cash_balance === "number" ? recordReadAt : undefined,
      first_name: record?.first_name ?? (session.user as any).first_name ?? null,
      last_name: record?.last_name ?? (session.user as any).last_name ?? null,
      country: record?.country ?? (session.user as any).country ?? null,
      phone: record?.phone ?? (session.user as any).phone ?? null,
      secondary_email: record?.secondary_email ?? (session.user as any).secondary_email ?? null,
      identityConflict,
    };
  }
}

/**
 * Read the session without rotating it and without trusting session_data.
 * Portfolio loads and confirmed trades use this so a just-issued login cookie
 * cannot 401 the book or clear the session.
 */
/** b29: a write that changed this user's record (cash, plan) must not be answered from the record cache. */
export function forgetCachedUserRecord(userId: string | null | undefined): void {
  if (userId) recordCache.delete(userId);
}

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
  if (user?.subscription_status !== "active") return false;
  const key = normalizePlanKey(user.subscription_plan);
  return PAID_PLANS.includes(key);
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
