/**
 * G-10 (GOAL-LOCK row 45): durable tombstones in the approved `ledger_tombstone` table.
 * The b39 tombstone (memory + edge cache) is lost on a cold start or cache eviction, so a late journal
 * replay could recreate a deleted row. With LEDGER_TOMBSTONE_TABLE=on, every tombstone is also written
 * to the table (idempotent by user + client_op_id) and checked there on a miss. Off = previous path.
 */
import { flagOn } from "@/lib/schema/types";
import { LEDGER_TOMBSTONE } from "@/lib/schema/ledger-tombstone.schema";

export const TOMBSTONE_TTL_DAYS = 30;

export interface TombstoneMeta {
  entityType?: "trade" | "dividend" | "cash";
  entityId?: string;
  portfolioId?: string;
  op?: "delete" | "replace";
}

export interface TombstoneRecord {
  user: string;
  portfolio_id: string;
  entity_type: "trade" | "dividend" | "cash";
  entity_id: string;
  op: "delete" | "replace";
  client_op_id: string;
  expires_at: string;
}

/** Storage port, so the logic is testable without Totalum. Every call is scoped to one user. */
export interface TombstoneStore {
  findByKey(userId: string, clientOpId: string): Promise<TombstoneRecord | null>;
  create(record: TombstoneRecord): Promise<void>;
}

export function tombstoneTableEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn("LEDGER_TOMBSTONE_TABLE", env);
}

export function entityTypeOf(rowType: string): "trade" | "dividend" | "cash" {
  const t = rowType.toLowerCase();
  if (t === "buy" || t === "sell") return "trade";
  if (t === "dividend") return "dividend";
  return "cash";
}

export function tombstoneRecord(userId: string, clientOpId: string, meta: TombstoneMeta, now = Date.now()): TombstoneRecord {
  return {
    user: userId,
    portfolio_id: meta.portfolioId || "",
    entity_type: meta.entityType || "trade",
    entity_id: meta.entityId || "",
    op: meta.op || "delete",
    client_op_id: clientOpId,
    expires_at: new Date(now + TOMBSTONE_TTL_DAYS * 86400_000).toISOString(),
  };
}

/** Idempotent: a second tombstone for the same user + key writes nothing. */
export async function writeDurableTombstone(store: TombstoneStore, userId: string, clientOpId: string, meta: TombstoneMeta = {}, now = Date.now()): Promise<"created" | "exists"> {
  if (await store.findByKey(userId, clientOpId)) return "exists";
  await store.create(tombstoneRecord(userId, clientOpId, meta, now));
  return "created";
}

export async function durableTombstoned(store: TombstoneStore, userId: string, clientOpId: string): Promise<boolean> {
  return Boolean(await store.findByKey(userId, clientOpId));
}

/** Rows whose key is tombstoned are never returned by a read, sync or reload. */
export function withoutTombstoned<T extends { notes?: string | null }>(rows: readonly T[], tombstonedKeys: ReadonlySet<string>, keyOf: (notes?: string | null) => string): T[] {
  return rows.filter((r) => {
    const k = keyOf(r.notes);
    return !k || !tombstonedKeys.has(k);
  });
}

export const LEDGER_TOMBSTONE_TABLE = LEDGER_TOMBSTONE.table;
