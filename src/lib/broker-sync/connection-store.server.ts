import "server-only";
import { totalumSdk } from "@/lib/totalum";

/**
 * Broker sync: one Totalum table, `broker_connection` (created by Executor, not by code):
 *   user (relation → user), broker (text), enc_token (long text), query_id (text),
 *   last_sync (date with hour), status (text), last_error (text).
 * enc_token is AES-GCM ciphertext (token-crypto.server.ts). It never leaves this module
 * except to the sync worker, and is never returned to the client or logged.
 */
export const BROKER_TABLE = "broker_connection";
export const BROKER_TABLE_MISSING =
  "Broker connections are not set up on this server yet (the broker_connection table is missing). Nothing was saved.";

export type BrokerId = "ibkr";
export type ConnectionStatus = "active" | "error" | "expired";

export interface StoredConnection {
  _id: string;
  user: string;
  broker: BrokerId;
  enc_token: string;
  query_id: string;
  last_sync: string | null;
  status: ConnectionStatus;
  last_error: string | null;
}

/** What the browser may see. No token, no ciphertext. */
export interface PublicConnection {
  broker: BrokerId;
  queryId: string;
  lastSync: string | null;
  status: ConnectionStatus;
  lastError: string | null;
}

function ownerOf(row: Record<string, unknown>): string {
  const u = row.user as unknown;
  if (typeof u === "string") return u;
  if (u && typeof u === "object") return String((u as { _id?: string })._id || "");
  return "";
}

function tableError(err: unknown): Error {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (/not found|does not exist|unknown (table|type)|no such table/.test(msg)) return new Error(BROKER_TABLE_MISSING);
  return new Error("Broker connections could not be read. Try again later.");
}

function toStored(row: Record<string, unknown>): StoredConnection {
  return {
    _id: String(row._id || ""),
    user: ownerOf(row),
    broker: "ibkr",
    enc_token: String(row.enc_token || ""),
    query_id: String(row.query_id || ""),
    last_sync: row.last_sync ? String(row.last_sync) : null,
    status: (["active", "error", "expired"].includes(String(row.status)) ? row.status : "active") as ConnectionStatus,
    last_error: row.last_error ? String(row.last_error) : null,
  };
}

export function publicConnection(c: StoredConnection | null): PublicConnection | null {
  if (!c) return null;
  return { broker: c.broker, queryId: c.query_id, lastSync: c.last_sync, status: c.status, lastError: c.last_error };
}

export async function findConnection(userId: string, broker: BrokerId): Promise<StoredConnection | null> {
  try {
    const res = await totalumSdk.crud.query(BROKER_TABLE, { _filter: { user: userId, broker }, _limit: 5 } as never);
    const rows = ((res as { data?: Record<string, unknown>[] })?.data || []).filter((r) => ownerOf(r) === userId && r.broker === broker);
    return rows.length ? toStored(rows[0]) : null;
  } catch (err) {
    throw tableError(err);
  }
}

export async function saveConnection(userId: string, broker: BrokerId, encToken: string, queryId: string): Promise<void> {
  try {
    const existing = await findConnection(userId, broker);
    const fields = { enc_token: encToken, query_id: queryId, status: "active", last_error: "" };
    if (existing) await totalumSdk.crud.editRecordById(BROKER_TABLE, existing._id, fields);
    else await totalumSdk.crud.createRecord(BROKER_TABLE, { ...fields, user: userId, broker, last_sync: null });
  } catch (err) {
    throw err instanceof Error && err.message === BROKER_TABLE_MISSING ? err : tableError(err);
  }
}

export async function markSync(id: string, status: ConnectionStatus, lastError: string | null): Promise<void> {
  await totalumSdk.crud.editRecordById(BROKER_TABLE, id, { status, last_error: lastError || "", last_sync: new Date().toISOString() });
}

/** Disconnect: the row (and its ciphertext) is deleted, not blanked. */
export async function deleteConnection(userId: string, broker: BrokerId): Promise<boolean> {
  const existing = await findConnection(userId, broker);
  if (!existing) return false;
  await totalumSdk.crud.deleteRecordById(BROKER_TABLE, existing._id);
  return true;
}

/** Account deletion: every broker connection for the member is deleted. */
export async function deleteAllConnectionsForUser(userId: string): Promise<number> {
  const res = await totalumSdk.crud.query(BROKER_TABLE, { _filter: { user: userId }, _limit: 50 } as never).catch(() => null);
  const rows = ((res as { data?: Record<string, unknown>[] } | null)?.data || []).filter((r) => ownerOf(r) === userId);
  for (const row of rows) await totalumSdk.crud.deleteRecordById(BROKER_TABLE, String(row._id));
  return rows.length;
}

export async function listActiveConnections(limit = 500): Promise<StoredConnection[]> {
  const res = await totalumSdk.crud.query(BROKER_TABLE, { _filter: { broker: "ibkr" }, _limit: limit } as never);
  return ((res as { data?: Record<string, unknown>[] })?.data || []).map(toStored).filter((c) => c.user && c.status !== "expired");
}
