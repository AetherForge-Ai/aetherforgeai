import { beforeEach, describe, expect, it } from "vitest";
import { configureDurableTombstones, isIdemTombstoned, markIdemTombstone, resetIdemGuardForTests } from "@/lib/idem-guard";
import { durableTombstoned, entityTypeOf, tombstoneTableEnabled, withoutTombstoned, writeDurableTombstone, type TombstoneRecord, type TombstoneStore } from "@/lib/ledger-tombstone";
import { LEDGER_TOMBSTONE } from "@/lib/schema/ledger-tombstone.schema";

function memStore() {
  const rows: TombstoneRecord[] = [];
  const store: TombstoneStore = {
    async findByKey(userId, key) {
      return rows.find((r) => r.user === userId && r.client_op_id === key) || null;
    },
    async create(r) {
      rows.push(r);
    },
  };
  return { rows, store };
}

describe("G-10 ledger_tombstone (approved 20 Oct 2026 15:52 NZDT)", () => {
  beforeEach(() => resetIdemGuardForTests());

  it("schema is additive and matches the AC fields", () => {
    expect(LEDGER_TOMBSTONE.table).toBe("ledger_tombstone");
    expect(LEDGER_TOMBSTONE.fields.map((f) => f.name)).toEqual(["user", "portfolio_id", "entity_type", "entity_id", "op", "client_op_id", "expires_at"]);
    expect(LEDGER_TOMBSTONE.indexes[0]).toEqual({ fields: ["user", "client_op_id"], unique: true });
    expect(LEDGER_TOMBSTONE.fields.some((f) => ["_id", "createdAt", "updatedAt"].includes(f.name))).toBe(false);
  });

  it("idempotent by user + client_op_id", async () => {
    const { rows, store } = memStore();
    expect(await writeDurableTombstone(store, "u1", "k1", { entityType: "trade", entityId: "t1" })).toBe("created");
    expect(await writeDurableTombstone(store, "u1", "k1")).toBe("exists");
    expect(rows).toHaveLength(1);
    expect(rows[0].op).toBe("delete");
  });

  it("a second user cannot see the first user's tombstones", async () => {
    const { store } = memStore();
    await writeDurableTombstone(store, "u1", "k1");
    expect(await durableTombstoned(store, "u2", "k1")).toBe(false);
  });

  it("20 save/delete cycles with a cold start mid-save: 0 resurrected rows", async () => {
    const { store } = memStore();
    configureDurableTombstones(store);
    for (let i = 0; i < 20; i++) {
      await markIdemTombstone("u1", `key-${i}`, Date.now(), { entityType: "dividend", entityId: `row-${i}` });
      // cold start: the isolate's memory is gone; the durable table still answers
      resetIdemGuardForTests();
      configureDurableTombstones(store);
      expect(await isIdemTombstoned("u1", `key-${i}`)).toBe(true);
    }
    const book = Array.from({ length: 20 }, (_, i) => ({ notes: `[idem:key-${i}]` }));
    const keys = new Set(Array.from({ length: 20 }, (_, i) => `key-${i}`));
    expect(withoutTombstoned(book, keys, (n) => /\[idem:([^\]]+)\]/.exec(n || "")?.[1] || "")).toHaveLength(0);
  });

  it("rollback: flag off = previous path (memory/edge only); nothing written to the table", async () => {
    expect(tombstoneTableEnabled({})).toBe(false);
    expect(tombstoneTableEnabled({ LEDGER_TOMBSTONE_TABLE: "on" })).toBe(true);
    const { rows } = memStore();
    configureDurableTombstones(null);
    await markIdemTombstone("u1", "k9");
    expect(rows).toHaveLength(0);
    expect(await isIdemTombstoned("u1", "k9")).toBe(true); // memory still covers this isolate
    resetIdemGuardForTests();
    expect(await isIdemTombstoned("u1", "k9")).toBe(false); // the known b39 gap the table closes
  });

  it("a failing table write never blocks the delete", async () => {
    configureDurableTombstones({ findByKey: async () => null, create: async () => { throw new Error("504"); } });
    await expect(markIdemTombstone("u1", "k2")).resolves.toBeUndefined();
    expect(await isIdemTombstoned("u1", "k2")).toBe(true);
  });

  it("entity types", () => {
    expect(entityTypeOf("buy")).toBe("trade");
    expect(entityTypeOf("dividend")).toBe("dividend");
    expect(entityTypeOf("deposit")).toBe("cash");
  });
});
