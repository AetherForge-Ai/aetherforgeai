import "server-only";
import { totalumSdk } from "@/lib/totalum";
import type { ApiKeyRecord, Portfolio, Seat } from "@/lib/ultimate/core";

/**
 * Reads the Ultimate tables (docs/ultimate-tables-spec.md). Only reached when
 * ULTIMATE_FEATURES=1. A missing table reads as empty, so every key is 401.
 */
export async function loadUltimateStore(): Promise<{ portfolios: Portfolio[]; seats: Seat[]; keys: ApiKeyRecord[] }> {
  const read = async <T>(table: string, map: (r: Record<string, any>) => T): Promise<T[]> => {
    try {
      const res = await totalumSdk.crud.query(table, { _limit: 2000 });
      return ((res?.data as unknown as Record<string, any>[]) || []).map(map);
    } catch {
      return [];
    }
  };
  const [portfolios, seats, keys] = await Promise.all([
    read("af_portfolio", (r) => ({ id: String(r._id), ownerUserId: String(r.owner_user?._id ?? r.owner_user ?? ""), name: String(r.name || "") })),
    read("af_seat", (r) => ({ portfolioId: String(r.portfolio?._id ?? r.portfolio ?? ""), userId: String(r.user?._id ?? r.user ?? ""), role: r.role === "owner" ? "owner" : "viewer", revokedAt: r.revoked_at || null }) as Seat),
    read("af_api_key", (r) => ({ id: String(r._id), ownerUserId: String(r.owner_user?._id ?? r.owner_user ?? ""), hash: String(r.key_hash || ""), prefix: String(r.prefix || ""), createdAt: String(r.createdAt || ""), revokedAt: r.revoked_at || null })),
  ]);
  return { portfolios, seats, keys };
}
