import "server-only";

import { DAILY_PRICE_CAPTURE_LOCK } from "@/lib/schema/daily-price-history.schema";
import { flagOn } from "@/lib/schema/types";
import { totalumSdk } from "@/lib/totalum";
import { acquireCaptureLock, type CaptureLockRow } from "@/lib/daily-price-lock";

const LOCK_KEY = "daily-prices";

function asLock(raw: Record<string, unknown>): CaptureLockRow | null {
  const owner = String(raw.owner || "");
  const acquiredAt = Date.parse(String(raw.acquired_at || ""));
  const expiresAt = Date.parse(String(raw.expires_at || ""));
  if (!owner || !Number.isFinite(acquiredAt) || !Number.isFinite(expiresAt)) return null;
  return { id: String(raw._id || `${owner}:${acquiredAt}`), owner, acquiredAt, expiresAt };
}

async function listLocks(): Promise<CaptureLockRow[]> {
  const res = await totalumSdk.crud.query(DAILY_PRICE_CAPTURE_LOCK.table, {
    _filter: { lock_key: LOCK_KEY },
    _limit: 20,
  } as never);
  return ((res as { data?: Array<Record<string, unknown>> })?.data || []).map(asLock).filter((row): row is CaptureLockRow => !!row);
}

export async function acquireDailyPriceRunLock(owner: string, now = Date.now()): Promise<"acquired" | "held" | "unavailable"> {
  if (!flagOn("DAILY_PRICE_HISTORY_TABLE")) return "unavailable";
  try {
    return await acquireCaptureLock({
      owner,
      now,
      list: listLocks,
      insert: async (row) => {
        await totalumSdk.crud.createRecord(DAILY_PRICE_CAPTURE_LOCK.table, {
          lock_key: LOCK_KEY,
          owner: row.owner,
          acquired_at: new Date(row.acquiredAt).toISOString(),
          expires_at: new Date(row.expiresAt).toISOString(),
        } as never);
      },
    });
  } catch (err) {
    console.error("[daily-prices] lock failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return "unavailable";
  }
}

/** Lets the next run start. A failed release still expires on its own. Never touches a price row. */
export async function releaseDailyPriceRunLock(owner: string, now = Date.now()): Promise<void> {
  try {
    const res = await totalumSdk.crud.query(DAILY_PRICE_CAPTURE_LOCK.table, {
      _filter: { lock_key: LOCK_KEY, owner },
      _limit: 5,
    } as never);
    const rows = ((res as { data?: Array<Record<string, unknown>> })?.data || []);
    for (const row of rows) {
      const id = String(row._id || "");
      if (!id) continue;
      await totalumSdk.crud.editRecordById(DAILY_PRICE_CAPTURE_LOCK.table, id, {
        expires_at: new Date(now).toISOString(),
      } as never);
    }
  } catch (err) {
    console.error("[daily-prices] lock release failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
  }
}
