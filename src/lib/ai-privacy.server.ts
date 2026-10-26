import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { AI_PRIVACY_TICKER, aiPrivacyModeEnabled, parseAiPrivacyMode, type AiPrivacyMode } from "@/lib/ai-privacy";

/**
 * G-26: the member's AI mode. No new Totalum table or column: a hidden row in the existing `watchlist`
 * table (ticker AF-AIPV, JSON in `name`), like AF-FIFT. /api/watchlist never lists it.
 * With the flag off this returns "on" without a read, so prod behaviour is unchanged.
 */
type Row = { _id?: string; ticker?: string; name?: string; user?: unknown };

function ownerOf(row: Row): string {
  const u = row.user as unknown;
  if (typeof u === "string") return u;
  if (u && typeof u === "object") return String((u as { _id?: string })._id || "");
  return "";
}

async function findRow(userId: string): Promise<Row | null> {
  const res = await totalumSdk.crud.query("watchlist", { _filter: { ticker: AI_PRIVACY_TICKER, user: userId }, _limit: 5 });
  const rows = ((res as { data?: Row[] })?.data || []) as Row[];
  return rows.find((r) => ownerOf(r) === userId && String(r.ticker || "").toUpperCase() === AI_PRIVACY_TICKER) ?? null;
}

/** Fails closed: if the setting cannot be read, AI is treated as off for this request. */
export async function readAiPrivacyMode(userId: string, env: Record<string, string | undefined> = process.env): Promise<AiPrivacyMode> {
  if (!aiPrivacyModeEnabled(env)) return "on";
  try {
    const row = await findRow(userId);
    if (!row?.name) return "on";
    return parseAiPrivacyMode((JSON.parse(row.name) as { mode?: unknown }).mode);
  } catch {
    return "off";
  }
}

export async function saveAiPrivacyMode(userId: string, value: unknown): Promise<AiPrivacyMode> {
  const mode = parseAiPrivacyMode(value);
  const name = JSON.stringify({ mode, savedAt: new Date().toISOString() });
  const row = await findRow(userId);
  if (row?._id) await totalumSdk.crud.editRecordById("watchlist", String(row._id), { name });
  else await totalumSdk.crud.createRecord("watchlist", { ticker: AI_PRIVACY_TICKER, name, user: userId, asset_type: "stock", market: "NZX" });
  return mode;
}
