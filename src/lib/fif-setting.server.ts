import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { FIF_COST_THRESHOLD_NZD, FIF_JOINT_THRESHOLD_NZD, normaliseFifThreshold } from "@/lib/fif-working-paper";

/**
 * b29 H-9: the FIF de minimis threshold, saved per portfolio (one book per member). No new Totalum
 * column: it is a hidden row in the existing `watchlist` table owned by the member
 * (ticker AF-FIFT, the value in `name` as JSON). /api/watchlist never lists AF- rows.
 * Default NZ$50,000. NZ$100,000 is allowed only as "jointly held".
 */
export const FIF_SETTING_TICKER = "AF-FIFT";

type Row = { _id?: string; ticker?: string; name?: string; user?: unknown };

function ownerOf(row: Row): string {
  const u = row.user as unknown;
  if (typeof u === "string") return u;
  if (u && typeof u === "object") return String((u as { _id?: string })._id || "");
  return "";
}

async function findRow(userId: string): Promise<Row | null> {
  const res = await totalumSdk.crud.query("watchlist", { _filter: { ticker: FIF_SETTING_TICKER, user: userId }, _limit: 5 });
  const rows = ((res as { data?: Row[] })?.data || []) as Row[];
  return rows.find((r) => ownerOf(r) === userId && String(r.ticker || "").toUpperCase() === FIF_SETTING_TICKER) ?? null;
}

export async function readFifThreshold(userId: string): Promise<number> {
  try {
    const row = await findRow(userId);
    if (!row?.name) return FIF_COST_THRESHOLD_NZD;
    const parsed = JSON.parse(row.name) as { thresholdNzd?: unknown };
    return normaliseFifThreshold(parsed.thresholdNzd);
  } catch {
    return FIF_COST_THRESHOLD_NZD;
  }
}

export async function saveFifThreshold(userId: string, value: number): Promise<number> {
  const thresholdNzd = normaliseFifThreshold(value);
  const name = JSON.stringify({ thresholdNzd, jointlyHeld: thresholdNzd === FIF_JOINT_THRESHOLD_NZD, savedAt: new Date().toISOString() });
  const row = await findRow(userId);
  if (row?._id) await totalumSdk.crud.editRecordById("watchlist", String(row._id), { name });
  else await totalumSdk.crud.createRecord("watchlist", { ticker: FIF_SETTING_TICKER, name, user: userId, asset_type: "stock", market: "NZX" });
  return thresholdNzd;
}
