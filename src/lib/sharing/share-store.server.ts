import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { PORTFOLIO_SHARE, SHARE_AUDIT_EVENT } from "@/lib/schema/sharing.schema";
import type { AuditEvent, Share } from "@/lib/sharing/share-core";

const idOf = (v: unknown) => (typeof v === "object" && v ? String((v as { _id?: string })._id || "") : String(v || ""));
function norm(r: Record<string, unknown>): Share {
  return { ...(r as unknown as Share), owner: idOf(r.owner), invitee: idOf(r.invitee) || null };
}

/** Fresh reads every time (no cache), so a revoke applies to the next request. */
export async function sharesFor(filter: Record<string, string>): Promise<Share[]> {
  const res = await totalumSdk.crud.query(PORTFOLIO_SHARE.table, { _filter: filter, _limit: 200 } as never);
  return (((res as { data?: Record<string, unknown>[] })?.data) || []).map(norm);
}

export async function createShareRow(share: Omit<Share, "_id">): Promise<string> {
  const res = await totalumSdk.crud.createRecord(PORTFOLIO_SHARE.table, share as never);
  return idOf((res as { data?: unknown })?.data);
}

export async function updateShareRow(id: string, patch: Partial<Share>): Promise<void> {
  await totalumSdk.crud.editRecordById(PORTFOLIO_SHARE.table, id, patch as never);
}

export async function logShareEvent(event: AuditEvent): Promise<void> {
  await totalumSdk.crud.createRecord(SHARE_AUDIT_EVENT.table, event as never).catch(() => console.error("[share] audit write failed"));
}

export async function auditFor(shareId: string): Promise<AuditEvent[]> {
  const res = await totalumSdk.crud.query(SHARE_AUDIT_EVENT.table, { _filter: { share: shareId }, _limit: 500 } as never);
  return (((res as { data?: Record<string, unknown>[] })?.data) || []).map((r) => ({ ...(r as unknown as AuditEvent), actor: idOf(r.actor) || null }));
}

/** b66 G-27: false when the owner's account no longer exists (deleted). Errors fail closed. */
export async function ownerExists(ownerId: string): Promise<boolean> {
  if (!ownerId) return false;
  try {
    const res = await totalumSdk.crud.query("user", { _filter: { _id: ownerId }, _limit: 1 } as never);
    return (((res as { data?: unknown[] })?.data) || []).length > 0;
  } catch {
    return false;
  }
}

/** b66 G-27: account deletion revokes every share the owner made (call before deleting the user). */
export async function revokeAllSharesForOwner(ownerId: string, now = Date.now()): Promise<number> {
  const { revokeAllForOwner } = await import("@/lib/sharing/share-core");
  const rows = revokeAllForOwner(await sharesFor({ owner: ownerId }), ownerId, now);
  for (const s of rows) {
    await updateShareRow(s._id, { status: "revoked", revoked_at: s.revoked_at });
    await logShareEvent({ share: s._id, portfolio_id: s.portfolio_id, actor: ownerId, event: "revoke", ip_trunc: "" });
  }
  return rows.length;
}

/** b66 G-27: the owner's rows for the read-only view (shaped by sharedBookView before leaving the server). */
export async function loadOwnerBookRows(ownerId: string) {
  const [stocks, metals, trades] = await Promise.all([
    totalumSdk.crud.query("stock", { _filter: { user: ownerId }, _limit: 500 } as never),
    totalumSdk.crud.query("precious_metal", { _filter: { user: ownerId }, _limit: 200 } as never),
    totalumSdk.crud.query("transaction", { _filter: { user: ownerId }, _limit: 500 } as never),
  ]);
  const rows = (r: unknown) => ((r as { data?: Record<string, unknown>[] })?.data) || [];
  return { stocks: rows(stocks), metals: rows(metals), trades: rows(trades) };
}
