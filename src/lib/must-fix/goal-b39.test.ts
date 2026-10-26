// pull-check:v3-m7-b74-2026-10-27
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  guardedIdemWrite,
  idemKeyFromNotes,
  idemNotesRegex,
  isIdemTombstoned,
  markIdemTombstone,
  pickIdemWinner,
  resetIdemGuardForTests,
  withKeyLock,
  type IdemRow,
} from "@/lib/idem-guard";
import { clearPendingWrite, journalPendingWrite, listPendingWrites, replayPendingWrites } from "@/lib/write-journal";

const read = (p: string) => readFileSync(p, "utf8");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A Totalum-like table: no unique constraint, inserts take time, reads can lag. */
function fakeBook() {
  const rows: Array<IdemRow & { amount: number; user: string }> = [];
  let cash = 0;
  let seq = 0;
  const tomb = new Set<string>();
  const find = (user: string, key: string) => async () => {
    await sleep(5);
    const re = new RegExp(idemNotesRegex(key));
    return rows.filter((r) => r.user === user && re.test(String(r.notes || ""))).map((r) => ({ ...r }));
  };
  const insert = (user: string, key: string, amount: number) => async () => {
    await sleep(20); // the window where a concurrent request can't see this row yet
    seq += 1;
    const row = { _id: `tx${String(seq).padStart(3, "0")}`, createdAt: 1000 + seq, notes: `Deposit idem=${key}`, amount, user };
    rows.push(row);
    cash += amount;
    return { row: { ...row } };
  };
  const reverse = async (row: IdemRow) => {
    const at = rows.findIndex((r) => r._id === row._id);
    if (at === -1) return;
    cash -= rows[at].amount;
    rows.splice(at, 1);
  };
  const del = async (id: string, user: string) => {
    const r = rows.find((x) => x._id === id);
    if (!r) return { ok: true, status: 200 };
    const key = idemKeyFromNotes(r.notes);
    await reverse(r);
    if (key) tomb.add(`${user}:${key}`);
    return { ok: true, status: 200 };
  };
  const post = (user: string, iso: string) => async (payload: Record<string, unknown>) => {
    const key = String(payload.idempotency_key);
    const out = await guardedIdemWrite(`${user}:${key}${iso}`, {
      tombstoned: async () => tomb.has(`${user}:${key}`),
      find: find(user, key),
      insert: insert(user, key, Number(payload.amount)),
      reverse,
    });
    if (out.kind === "tombstoned") return { ok: false, status: 410, error: "removed" };
    return { ok: true, status: 200, data: { lastTransaction: out.row, cashBalance: cash } };
  };
  return { rows, get cash() { return cash; }, post, del, find };
}

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

beforeEach(() => resetIdemGuardForTests());

describe("b39 G-10 (P1): server dedupe on the idempotency key", () => {
  it("TT sequence: Confirm, hard reload at 0.4 s, reload at 5 s replays → one NZ$100 row, cash NZ$100", async () => {
    const book = fakeBook();
    const s = memStore();
    const key = "w-tt-h9-tax-100";
    const payload = { type: "deposit", amount: 100, idempotency_key: key };
    journalPendingWrite({ key, userId: "h9", method: "POST", payload, at: 0 }, s);
    // The original POST is still running server-side when the reloaded page replays the journal.
    const original = book.post("h9", "#isolateA")(payload);
    await sleep(2);
    const replay = replayPendingWrites("h9", book.post("h9", "#isolateB"), s, 5_000);
    await Promise.all([original, replay]);
    expect(book.rows).toHaveLength(1);
    expect(book.cash).toBe(100);
    expect(listPendingWrites("h9", s)).toHaveLength(0);
    // A further reload replays nothing and changes nothing.
    await replayPendingWrites("h9", book.post("h9", "#isolateC"), s, 10_000);
    expect(book.rows).toHaveLength(1);
  });

  it("concurrent duplicate POSTs across isolates converge on one row (earliest wins, cash reversed)", async () => {
    const book = fakeBook();
    const p = { type: "deposit", amount: 100, idempotency_key: "w-race" };
    const results = await Promise.all([1, 2, 3, 4].map((i) => book.post("u1", `#iso${i}`)(p)));
    expect(book.rows).toHaveLength(1);
    expect(book.cash).toBe(100);
    const ids = new Set(results.map((r) => (r.data as { lastTransaction: IdemRow }).lastTransaction._id));
    expect(ids.size).toBe(1);
  });

  it("concurrent repeats in one isolate are serialised by the per-key lock (single insert)", async () => {
    const book = fakeBook();
    const p = { type: "deposit", amount: 100, idempotency_key: "w-same-iso" };
    await Promise.all([book.post("u1", "")(p), book.post("u1", "")(p), book.post("u1", "")(p)]);
    expect(book.rows).toHaveLength(1);
    expect(book.cash).toBe(100);
  });

  it("delete then reload: the row stays gone (journal cancelled by key, server tombstone 410)", async () => {
    const book = fakeBook();
    const s = memStore();
    const key = "w-del";
    const payload = { type: "deposit", amount: 100, idempotency_key: key };
    await book.post("h9", "")(payload);
    // A stale pending entry is still in the journal (the reload lost the answer).
    journalPendingWrite({ key, userId: "h9", method: "POST", payload, at: 0 }, s);
    const id = book.rows[0]._id as string;
    // Client: deleting a row cancels its replay; server: tombstones the key.
    clearPendingWrite(key, s);
    await book.del(id, "h9");
    await replayPendingWrites("h9", book.post("h9", ""), s, 10_000);
    expect(book.rows).toHaveLength(0);
    expect(book.cash).toBe(0);
    // Even if the entry survived (another tab), the server refuses to recreate it.
    journalPendingWrite({ key, userId: "h9", method: "POST", payload, at: 0 }, s);
    const out = await replayPendingWrites("h9", book.post("h9", ""), s, 10_000);
    expect(book.rows).toHaveLength(0);
    expect(out.refused).toHaveLength(1);
    expect(listPendingWrites("h9", s)).toHaveLength(0);
  });

  it("a pending DELETE naming the key cancels the POST replay", async () => {
    const s = memStore();
    journalPendingWrite({ key: "k1", userId: "u", method: "POST", payload: { amount: 1 }, at: 0 }, s);
    journalPendingWrite({ key: "d1", userId: "u", method: "DELETE", payload: {}, deleteId: "tx1", idem: "k1", at: 0 }, s);
    let posted = 0;
    await replayPendingWrites("u", async () => ((posted += 1), { ok: true }), s, 10_000, async () => ({ ok: true, status: 200 }));
    expect(posted).toBe(0);
    expect(listPendingWrites("u", s)).toHaveLength(0);
  });

  it("helpers: regex, key parse, winner, lock, tombstone", async () => {
    expect(new RegExp(idemNotesRegex("w-a.b")).test("x idem=w-a.b fx=1")).toBe(true);
    expect(new RegExp(idemNotesRegex("w-a.b")).test("idem=w-aXb")).toBe(false);
    expect(new RegExp(idemNotesRegex("w-a")).test("idem=w-ab")).toBe(false);
    expect(idemKeyFromNotes("Deposit idem=w-1 sh=2")).toBe("w-1");
    expect(idemKeyFromNotes("none")).toBeNull();
    expect(pickIdemWinner([{ _id: "b", createdAt: 2 }, { _id: "a", createdAt: 2 }, { _id: "c", createdAt: 1 }]).winner?._id).toBe("c");
    const order: number[] = [];
    await Promise.all([withKeyLock("k", async () => { await sleep(10); order.push(1); }), withKeyLock("k", async () => { order.push(2); })]);
    expect(order).toEqual([1, 2]);
    expect(await isIdemTombstoned("u", "k")).toBe(false);
    await markIdemTombstone("u", "k");
    expect(await isIdemTombstoned("u", "k")).toBe(true);
  });
});

describe("b39 G-10: wiring", () => {
  const route = read("src/app/api/transactions/route.ts");
  it("route resolves the key first with a fresh query, guards the insert, tombstones on delete", () => {
    expect(route).toMatch(/findIdemRowsFresh\(user\._id, idemKey\)/);
    expect(route).toMatch(/guardedIdemWrite<IdemRow>/);
    expect(route).toMatch(/markIdemTombstone\(user\._id, deletedKey[,)]/); // G-10 tombstone table adds metadata args
    expect(route).toMatch(/status: 410/);
    expect(route).not.toMatch(/findIdempotentRow\(book\.transactions/);
    expect(route.indexOf("findIdemRowsFresh(user._id, idemKey).catch")).toBeLessThan(route.indexOf("findDuplicateDividendTx(book.transactions"));
  });
  it("the dialog stays open on the optimistic paint; beforeunload warns while saving", () => {
    expect(read("src/components/dashboard/TransactionDialog.tsx")).toMatch(/if \(!l\?\.optimistic && !l\?\.optimisticRollback\) requestExplicitClose\(\)/);
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toMatch(/addEventListener\("beforeunload", warn\)/);
  });
  it("delete cancels the pending replay by key and sends it for the tombstone", () => {
    const d = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(d).toMatch(/if \(line\.idem\) clearPendingWrite\(line\.idem\)/);
    expect(d).toMatch(/&idem=\$\{encodeURIComponent\(line\.idem\)\}/);
  });
  it("the service worker never replays writes (GET only, no outbox)", () => {
    const sw = read("src/lib/pwa-worker.ts");
    expect(sw).toMatch(/request\.method !== "GET"/);
    expect(sw).not.toMatch(/outbox/i);
  });
});

describe("b39 P3: /settings after sign-out", () => {
  it("re-checks the session on bfcache restore and tab focus, and a 401 leaves for /login", () => {
    const r = read("src/components/auth/RedirectSignedOut.tsx");
    expect(r).toMatch(/addEventListener\("pageshow", onShow\)/);
    expect(r).toMatch(/visibilitychange/);
    expect(r).toMatch(/res\.status === 401/);
  });
});

describe("b39 G-10: hot path keeps one fresh lookup before the insert", () => {
  it("knownEmpty skips the repeat lookup only when the lock was free", async () => {
    let finds = 0;
    const deps = {
      tombstoned: async () => false,
      find: async () => ((finds += 1), []),
      insert: async () => ({ row: { _id: "x1", createdAt: 1 } }),
      reverse: async () => undefined,
      knownEmpty: true,
    };
    await guardedIdemWrite("solo", deps);
    expect(finds).toBe(1); // only the post-insert check
  });
});
