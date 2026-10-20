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
