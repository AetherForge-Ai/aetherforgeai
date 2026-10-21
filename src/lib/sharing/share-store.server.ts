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
