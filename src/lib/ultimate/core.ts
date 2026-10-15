/**
 * M-11 (BL-6): Ultimate seats, client portfolios and a read-only API.
 * Everything here is behind ULTIMATE_FEATURES (off). Pure logic, so the
 * isolation rules are unit-tested without a database. Storage needs the
 * Totalum tables in docs/ultimate-tables-spec.md before the flag goes on.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type SeatRole = "owner" | "viewer";

export interface Portfolio {
  id: string;
  /** The Ultimate account that owns it. */
  ownerUserId: string;
  name: string;
}

export interface Seat {
  portfolioId: string;
  userId: string;
  role: SeatRole;
  revokedAt?: string | null;
}

export interface ApiKeyRecord {
  id: string;
  ownerUserId: string;
  /** sha256 of the secret. The secret itself is shown once and never stored. */
  hash: string;
  prefix: string;
  createdAt: string;
  revokedAt?: string | null;
}

export const MAX_PORTFOLIOS = 25;

function activeSeat(seats: readonly Seat[], userId: string, portfolioId: string): Seat | undefined {
  return seats.find((s) => s.userId === userId && s.portfolioId === portfolioId && !s.revokedAt);
}

export function roleFor(userId: string, portfolio: Portfolio, seats: readonly Seat[]): SeatRole | null {
  if (portfolio.ownerUserId === userId) return "owner";
  return activeSeat(seats, userId, portfolio.id)?.role ?? null;
}

export function canRead(userId: string, portfolio: Portfolio, seats: readonly Seat[]): boolean {
  return roleFor(userId, portfolio, seats) != null;
}

/** Viewers never edit. Only the owner role writes. */
export function canEdit(userId: string, portfolio: Portfolio, seats: readonly Seat[]): boolean {
  return roleFor(userId, portfolio, seats) === "owner";
}

/** The portfolios one user may see. Nothing else is returned. */
export function visiblePortfolios(userId: string, portfolios: readonly Portfolio[], seats: readonly Seat[]): Portfolio[] {
  return portfolios.filter((p) => canRead(userId, p, seats));
}

/**
 * Rows tagged with a portfolio id, filtered to one portfolio the user may read.
 * Rows from any other portfolio are dropped even if a caller passed them in.
 */
export function rowsForPortfolio<T extends { portfolioId: string }>(
  userId: string,
  portfolio: Portfolio,
  seats: readonly Seat[],
  rows: readonly T[]
): T[] | null {
  if (!canRead(userId, portfolio, seats)) return null;
  return rows.filter((r) => r.portfolioId === portfolio.id);
}

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** New key: `afk_<prefix>_<secret>`. Only the hash and prefix are stored. */
export function issueApiKey(ownerUserId: string, now = new Date()): { secret: string; record: ApiKeyRecord } {
  const prefix = randomBytes(4).toString("hex");
  const secret = `afk_${prefix}_${randomBytes(24).toString("base64url")}`;
  return {
    secret,
    record: { id: `key_${prefix}`, ownerUserId, hash: hashApiKey(secret), prefix, createdAt: now.toISOString(), revokedAt: null },
  };
}

/** Rotation issues a new key and revokes the old one in the same step. */
export function rotateApiKey(old: ApiKeyRecord, now = new Date()) {
  const next = issueApiKey(old.ownerUserId, now);
  return { secret: next.secret, record: next.record, revoked: { ...old, revokedAt: now.toISOString() } };
}

/** Owner of a valid, unrevoked key, else null (the route answers 401). */
export function verifyApiKey(presented: string | null | undefined, keys: readonly ApiKeyRecord[]): string | null {
  if (!presented || !presented.startsWith("afk_")) return null;
  const prefix = presented.split("_")[1] || "";
  const want = Buffer.from(hashApiKey(presented), "hex");
  for (const key of keys) {
    if (key.prefix !== prefix || key.revokedAt) continue;
    const have = Buffer.from(key.hash, "hex");
    if (have.length === want.length && timingSafeEqual(have, want)) return key.ownerUserId;
  }
  return null;
}

/** Fixed-window limit per key: 60 requests a minute. */
export const API_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
export function rateLimitStep(
  state: Map<string, { start: number; count: number }>,
  keyId: string,
  now = Date.now()
): { ok: boolean; retryAfterSec: number } {
  const cur = state.get(keyId);
  if (!cur || now - cur.start >= API_RATE_LIMIT.windowMs) {
    state.set(keyId, { start: now, count: 1 });
    return { ok: true, retryAfterSec: 0 };
  }
  if (cur.count >= API_RATE_LIMIT.limit) {
    return { ok: false, retryAfterSec: Math.ceil((cur.start + API_RATE_LIMIT.windowMs - now) / 1000) };
  }
  cur.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Seat invite email: template only. Nothing in the build or tests sends it. */
export function seatInviteEmail(input: { ownerName: string; portfolioName: string; role: SeatRole; acceptUrl: string }) {
  const access = input.role === "viewer" ? "view (you cannot change anything)" : "manage";
  return {
    subject: `${input.ownerName} invited you to a portfolio on AetherForge AI`,
    text: [
      `${input.ownerName} has invited you to ${access} the portfolio "${input.portfolioName}" on AetherForge AI.`,
      `Accept the invite: ${input.acceptUrl}`,
      "If you were not expecting this, ignore this email. Nothing changes until you accept.",
      "AetherForge AI is general information only, not financial advice.",
    ].join("\n\n"),
  };
}
