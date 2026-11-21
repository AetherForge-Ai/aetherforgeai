import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { isStripeConfigured } from "@/lib/session";
import {
  allowedSignalBots,
  buildSignalFeed,
  type SignalBot,
  type SignalFeed,
  type StoredSignalReport,
} from "@/lib/chat-signals";

/**
 * Latest saved Stox/Koins report for each bot this plan already includes.
 * Same Totalum read the report service uses. Does not call a quote provider.
 */
export async function loadChatSignalFeed(
  user: { _id: string; bot_access?: string | null },
  now = new Date()
): Promise<SignalFeed> {
  const bots = allowedSignalBots(user.bot_access, isStripeConfigured());
  if (!bots.length) {
    return { status: "not_entitled", asOf: null, platformCoverage: "exchange-only", rows: [] };
  }
  try {
    const records: StoredSignalReport[] = [];
    for (const bot of bots) {
      const loaded = await loadLatestReport(user._id, bot);
      if (loaded) records.push(loaded);
    }
    return buildSignalFeed(records, now);
  } catch (err) {
    console.error("[chat-signals] feed read failed:", err);
    return { status: "failed", asOf: null, platformCoverage: "exchange-only", rows: [] };
  }
}

async function loadLatestReport(userId: string, bot: SignalBot): Promise<StoredSignalReport | null> {
  const res = await totalumSdk.crud.query("report", {
    _filter: { user: userId, bot },
    _sort: { createdAt: "desc" },
    _limit: 1,
  });
  const row = ((res as { data?: Array<Record<string, unknown>> })?.data || [])[0];
  if (!row) return null;
  const generatedAt = row.generated_at || row.createdAt;
  return {
    bot,
    generatedAt: typeof generatedAt === "string" ? generatedAt : generatedAt ? String(generatedAt) : null,
    payload: row.payload,
  };
}
