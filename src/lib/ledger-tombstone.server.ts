import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { LEDGER_TOMBSTONE_TABLE, type TombstoneRecord, type TombstoneStore } from "@/lib/ledger-tombstone";

/** Totalum-backed store for `ledger_tombstone`. Every query is filtered by the signed-in user's id. */
export const totalumTombstoneStore: TombstoneStore = {
  async findByKey(userId, clientOpId) {
    const res = await totalumSdk.crud.query(LEDGER_TOMBSTONE_TABLE, { _filter: { user: userId, client_op_id: clientOpId }, _limit: 1 } as never);
    const row = ((res as { data?: unknown[] })?.data || [])[0] as (TombstoneRecord & { user?: unknown }) | undefined;
    if (!row) return null;
    const owner = typeof row.user === "object" && row.user ? (row.user as { _id?: string })._id : row.user;
    return String(owner || "") === userId ? row : null;
  },
  async create(record) {
    await totalumSdk.crud.createRecord(LEDGER_TOMBSTONE_TABLE, record as never);
  },
};
