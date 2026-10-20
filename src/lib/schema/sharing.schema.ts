import type { TableSpec } from "./types";

export const PORTFOLIO_SHARE: TableSpec = {
  ticket: "G-27",
  table: "portfolio_share",
  purpose: "A read-only share of one portfolio with a family member or accountant (copy-link invite only).",
  fields: [
    { name: "portfolio_id", type: "string", required: true },
    { name: "owner", type: "objectReference", required: true, ref: { table: "user", relation: "manyToOne" }, note: "AC owner_user_id" },
    { name: "invitee", type: "objectReference", ref: { table: "user", relation: "manyToOne" }, note: "AC invitee_user_id; empty until accepted" },
    { name: "label", type: "options", required: true, options: ["accountant", "family"] },
    { name: "status", type: "options", required: true, options: ["pending", "accepted", "active", "revoked", "expired"] },
    { name: "token_hash", type: "string", required: true, note: "SHA-256 hex of the link token; the raw token is never stored" },
    { name: "expires_at", type: "date", required: true, includeHour: true },
    { name: "confirmed_at", type: "date", includeHour: true },
    { name: "revoked_at", type: "date", includeHour: true },
  ],
  indexes: [{ fields: ["token_hash"], unique: true }, { fields: ["owner"] }, { fields: ["invitee", "status"] }, { fields: ["portfolio_id"] }],
  access: "Owner creates/lists/revokes; invitee reads only portfolios with an active share; invitee writes are 403.",
  flag: "PORTFOLIO_SHARING=on",
  rollback: ["Set PORTFOLIO_SHARING off (share routes 404, no invitee reads).", "Then delete share_audit_event and portfolio_share in Totalum."],
};

export const SHARE_AUDIT_EVENT: TableSpec = {
  ticket: "G-27",
  table: "share_audit_event",
  purpose: "Access log for a share: link created, accept, confirm, view, export, revoke.",
  fields: [
    { name: "share", type: "objectReference", required: true, ref: { table: "portfolio_share", relation: "manyToOne" } },
    { name: "portfolio_id", type: "string", required: true },
    { name: "actor", type: "objectReference", ref: { table: "user", relation: "manyToOne" }, note: "AC actor_user_id" },
    { name: "event", type: "options", required: true, options: ["link_created", "accept", "confirm", "view", "export", "revoke"] },
    { name: "ip_trunc", type: "string", note: "IPv4 /24 or IPv6 /48 only" },
  ],
  indexes: [{ fields: ["share", "createdAt"] }, { fields: ["portfolio_id", "createdAt"] }],
  access: "Owner reads; invitee cannot. Written only by the server.",
  flag: "PORTFOLIO_SHARING=on",
  rollback: ["See portfolio_share."],
};

