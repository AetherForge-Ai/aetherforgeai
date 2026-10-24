/**
 * G-27 (GOAL-LOCK row 62): family / accountant read-only share. Pure rules, no I/O.
 * Locked: invitee sees only shared portfolios; revoke is immediate; access log.
 * Copy-link invites only (no email). Link works once, expires after 7 days; only its SHA-256 is stored.
 */
export const SHARE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ShareStatus = "pending" | "accepted" | "active" | "revoked" | "expired";
export type ShareEvent = "link_created" | "accept" | "confirm" | "view" | "export" | "revoke";

export interface Share {
  _id: string;
  portfolio_id: string;
  owner: string;
  invitee: string | null;
  label: "accountant" | "family";
  status: ShareStatus;
  token_hash: string;
  expires_at: string;
  confirmed_at?: string | null;
  revoked_at?: string | null;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes from Web Crypto (Web Crypto only), base64url. */
export function newShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

export function newShare(input: { id: string; portfolioId: string; ownerId: string; label: "accountant" | "family"; tokenHash: string; now: number }): Share {
  return {
    _id: input.id,
    portfolio_id: input.portfolioId,
    owner: input.ownerId,
    invitee: null,
    label: input.label,
    status: "pending",
    token_hash: input.tokenHash,
    expires_at: new Date(input.now + SHARE_LINK_TTL_MS).toISOString(),
  };
}

export type AcceptResult = { ok: true; share: Share } | { ok: false; reason: "expired" | "used" | "own" | "revoked" };

/** The link works once: only a pending, unexpired share can be accepted, and not by its owner. */
export function acceptShare(share: Share, inviteeId: string, now: number): AcceptResult {
  if (share.status === "revoked") return { ok: false, reason: "revoked" };
  if (share.status !== "pending" || share.invitee) return { ok: false, reason: "used" };
  if (Date.parse(share.expires_at) <= now) return { ok: false, reason: "expired" };
  if (share.owner === inviteeId) return { ok: false, reason: "own" };
  return { ok: true, share: { ...share, invitee: inviteeId, status: "accepted" } };
}

/** Owner confirms an accepted invitee. No access before this. */
export function confirmShare(share: Share, ownerId: string, now: number): Share | null {
  if (share.owner !== ownerId || share.status !== "accepted") return null;
  return { ...share, status: "active", confirmed_at: new Date(now).toISOString() };
}

export function revokeShare(share: Share, ownerId: string, now: number): Share | null {
  if (share.owner !== ownerId || share.status === "revoked") return null;
  return { ...share, status: "revoked", revoked_at: new Date(now).toISOString() };
}

/** Owner deletion revokes every share they own. */
export function revokeAllForOwner(shares: readonly Share[], ownerId: string, now: number): Share[] {
  return shares.filter((s) => s.owner === ownerId && s.status !== "revoked").map((s) => revokeShare(s, ownerId, now)!);
}

export type Access = "owner" | "read" | "none";

/**
 * Decided fresh on every request from the stored share rows (no cache), so a revoke is effective on
 * the invitee's next request. Writes are never allowed for an invitee.
 */
export function portfolioAccess(input: { userId: string; portfolioOwnerId: string; portfolioId: string; shares: readonly Share[]; now: number }): Access {
  if (input.userId === input.portfolioOwnerId) return "owner";
  const ok = input.shares.some(
    (s) => s.portfolio_id === input.portfolioId && s.owner === input.portfolioOwnerId && s.invitee === input.userId && s.status === "active"
  );
  return ok ? "read" : "none";
}

/** HTTP status for a request: invitee writes are 403; unshared portfolios are 404 (no existence leak). */
export function accessStatus(access: Access, write: boolean): 200 | 403 | 404 {
  if (access === "owner") return 200;
  if (access === "none") return 404;
  return write ? 403 : 200;
}

/** IPv4 /24 or IPv6 /48 only. */
export function truncateIp(ip: string | null | undefined): string {
  const v = String(ip || "").trim();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return v.split(".").slice(0, 3).join(".") + ".0/24";
  if (v.includes(":")) return v.split(":").slice(0, 3).join(":") + "::/48";
  return "";
}

export interface AuditEvent {
  share: string;
  portfolio_id: string;
  actor: string | null;
  event: ShareEvent;
  ip_trunc: string;
  createdAt?: string;
}

/** Only the owner reads the log. */
export function canReadAuditLog(share: Pick<Share, "owner">, userId: string): boolean {
  return share.owner === userId;
}

/** b66 G-27: what the owner UI may see of a share row. The token hash never leaves the server. */
export function publicShare(share: Share) {
  return {
    id: share._id,
    portfolioId: share.portfolio_id,
    label: share.label,
    status: liveStatus(share, Date.now()),
    hasInvitee: !!share.invitee,
    expiresAt: share.expires_at,
    confirmedAt: share.confirmed_at ?? null,
    revokedAt: share.revoked_at ?? null,
  };
}

/** A pending link past its 7 days reads as expired (the row is not rewritten just to say so). */
export function liveStatus(share: Pick<Share, "status" | "expires_at">, now: number): ShareStatus {
  if (share.status === "pending" && Date.parse(share.expires_at) <= now) return "expired";
  return share.status;
}

/**
 * b66 G-27: access for one request. A deleted owner account (ownerExists false) means no access at all,
 * so account deletion cuts every share off on the invitee's next request, even before rows are revoked.
 */
export function requestAccess(input: { userId: string; share: Share | null | undefined; ownerExists: boolean; now: number }): Access {
  const s = input.share;
  if (!s || !input.ownerExists) return "none";
  return portfolioAccess({ userId: input.userId, portfolioOwnerId: s.owner, portfolioId: s.portfolio_id, shares: [s], now: input.now });
}

/** "view" is logged once per share, viewer and hour (per server), so the log stays readable. */
export function makeViewDeduper(windowMs = 60 * 60 * 1000) {
  const seen = new Map<string, number>();
  return (shareId: string, viewerId: string, now = Date.now()): boolean => {
    const key = `${shareId}:${viewerId}`;
    const last = seen.get(key);
    if (last != null && now - last < windowMs) return false;
    seen.set(key, now);
    if (seen.size > 5000) seen.clear();
    return true;
  };
}

export interface SharedHolding {
  name: string;
  ticker: string;
  assetType: string;
  quantity: number;
  averageCost: number | null;
  currency: string;
}

export interface SharedTrade {
  date: string;
  type: string;
  ticker: string;
  quantity: number | null;
  price: number | null;
  currency: string;
}

/**
 * b66 G-27: the read-only book an invitee sees. Only the listed fields are copied out of the owner's
 * rows: no ids, notes, cash balance, goals, chat, bot reports or account details.
 */
export function sharedBookView(input: {
  stocks: readonly Record<string, unknown>[];
  metals: readonly Record<string, unknown>[];
  trades: readonly Record<string, unknown>[];
}): { holdings: SharedHolding[]; trades: SharedTrade[] } {
  const n = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const holdings: SharedHolding[] = [];
  for (const r of input.stocks) {
    const q = n(r.shares);
    if (!q || q <= 0) continue;
    holdings.push({
      name: String(r.company_name || r.ticker || ""),
      ticker: String(r.ticker || ""),
      assetType: String(r.asset_type || "stock"),
      quantity: q,
      averageCost: n(r.purchase_price),
      currency: String(r.currency || "NZD"),
    });
  }
  for (const r of input.metals) {
    const q = n(r.ounces);
    if (!q || q <= 0) continue;
    const metal = String(r.metal || "");
    holdings.push({ name: metal ? metal[0].toUpperCase() + metal.slice(1) : "Metal", ticker: metal.toUpperCase(), assetType: "metal", quantity: q, averageCost: n(r.purchase_price_per_oz), currency: "NZD" });
  }
  holdings.sort((a, b) => a.name.localeCompare(b.name));
  const trades: SharedTrade[] = input.trades
    .map((r) => ({
      date: String(r.executed_at || r.createdAt || "").slice(0, 10),
      type: String(r.type || ""),
      ticker: String(r.ticker || ""),
      quantity: n(r.quantity),
      price: n(r.price),
      currency: String(r.currency || "NZD"),
    }))
    .filter((t) => t.date && t.type)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 200);
  return { holdings, trades };
}
