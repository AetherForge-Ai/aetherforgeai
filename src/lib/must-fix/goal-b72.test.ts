// pull-check:v3-b87-2026-10-28
/** b72 (Chief, 27 Oct 2026): TT b71 P2 — deletes replayed after reload (second and last attempt). */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPendingDeletesFor, journalPendingWrite, listPendingWrites, pruneSettledDeletes, replayPendingWrites } from "@/lib/write-journal";
import { dedupedDelete, isDeleteConfirmed, resetDeleteDedupe } from "@/lib/delete-dedupe";
import { deletedIdKey, isIdemTombstoned, markIdemTombstone, resetIdemGuardForTests } from "@/lib/idem-guard";
import { PWA_WORKER_SCRIPT } from "@/lib/pwa-worker";

const read = (p: string) => readFileSync(p, "utf8");
function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const old = () => Date.now() - 60_000;
const queueDelete = (s: ReturnType<typeof memStore>, key: string, id: string) =>
  journalPendingWrite({ key, userId: "u1", method: "DELETE", payload: {}, deleteId: id, at: old() }, s);

beforeEach(() => {
  resetDeleteDedupe();
  resetIdemGuardForTests();
});

describe("b72 the real path: the pending-writes journal, not the service worker", () => {
  it("the service worker never handles a non-GET request or /api/", () => {
    expect(PWA_WORKER_SCRIPT).toMatch(/if \(request\.method !== "GET"\) return;/);
    expect(PWA_WORKER_SCRIPT).toMatch(/url\.pathname\.startsWith\("\/api\/"\)\) return;/);
    expect(PWA_WORKER_SCRIPT).not.toMatch(/addEventListener\("(sync|periodicsync|backgroundfetchsuccess)"|outbox|method: "DELETE"/i);
  });

  it("TT repro: the reload dropped the 200; on load the id is absent from a fresh ledger, so nothing is sent", async () => {
    const s = memStore();
    queueDelete(s, "k1", "tx55e7"); // journalled before the DELETE; the reload lost the answer
    const dropped = pruneSettledDeletes("u1", new Set(["dep1"]), s);
    expect(dropped).toEqual(["tx55e7"]);
    const send = vi.fn(async () => ({ ok: false, status: 404 }));
    await replayPendingWrites("u1", async () => ({ ok: false }), s, Date.now(), (id) => dedupedDelete(id, send, s));
    expect(send).not.toHaveBeenCalled();
    expect(listPendingWrites("u1", s)).toHaveLength(0);
  });

  it("a queued delete whose id is still listed is kept and replayed once", async () => {
    const s = memStore();
    queueDelete(s, "k2", "tx5915");
    expect(pruneSettledDeletes("u1", new Set(["tx5915"]), s)).toEqual([]);
    const send = vi.fn(async () => ({ ok: true, status: 200 }));
    await replayPendingWrites("u1", async () => ({ ok: false }), s, Date.now(), (id) => dedupedDelete(id, send, s));
    expect(send).toHaveBeenCalledTimes(1);
    expect(listPendingWrites("u1", s)).toHaveLength(0);
  });

  it("two queued entries for the same id (reload mid-delete) send one DELETE, and both clear", async () => {
    const s = memStore();
    queueDelete(s, "k3a", "tx5915");
    queueDelete(s, "k3b", "tx5915");
    const send = vi.fn(async () => ({ ok: true, status: 200 }));
    await replayPendingWrites("u1", async () => ({ ok: false }), s, Date.now(), (id) => send() as never);
    expect(send).toHaveBeenCalledTimes(1);
    expect(listPendingWrites("u1", s)).toHaveLength(0);
  });

  it("204 and 404 both clear the queued delete", async () => {
    for (const status of [204, 404]) {
      const s = memStore();
      queueDelete(s, `k-${status}`, `tx-${status}`);
      await replayPendingWrites("u1", async () => ({ ok: false }), s, Date.now(), async () => ({ ok: status === 204, status }));
      expect(listPendingWrites("u1", s)).toHaveLength(0);
    }
  });

  it("a 204 through dedupedDelete is success and is remembered", async () => {
    const s = memStore();
    const res = await dedupedDelete("tx204", async () => ({ ok: true, status: 204, data: {} }), s);
    expect(res).toMatchObject({ ok: true, data: { alreadyRemoved: true } });
    expect(isDeleteConfirmed("tx204", s)).toBe(true);
  });

  it("clearPendingDeletesFor removes every entry for that id only", () => {
    const s = memStore();
    queueDelete(s, "a", "x");
    queueDelete(s, "b", "x");
    queueDelete(s, "c", "y");
    expect(clearPendingDeletesFor("u1", "x", s)).toBe(2);
    expect(listPendingWrites("u1", s).map((w) => w.deleteId)).toEqual(["y"]);
  });
});

describe("b72 server: 204 for an id this user deleted, 404 otherwise", () => {
  it("the deleted-id tombstone is per user", async () => {
    await markIdemTombstone("u1", deletedIdKey("tx1"));
    expect(await isIdemTombstoned("u1", deletedIdKey("tx1"))).toBe(true);
    expect(await isIdemTombstoned("u2", deletedIdKey("tx1"))).toBe(false);
    expect(await isIdemTombstoned("u1", deletedIdKey("never"))).toBe(false);
  });

  it("the route answers 204 only when the caller's tombstone exists, keeps b40's 404, and tombstones on delete", () => {
    const r = read("src/app/api/transactions/route.ts");
    const missing = r.slice(r.indexOf("if (!row?._id) {"), r.indexOf("const owner = typeof row.user"));
    expect(missing).toMatch(/isIdemTombstoned\(user\._id, deletedIdKey\(id\)\)[\s\S]*status: 204/);
    expect(missing).toMatch(/\{ status: 404, headers: writeMarkHeaders\(\) \}/);
    expect(r).toMatch(/markIdemTombstone\(user\._id, deletedIdKey\(id\)/);
    // optimistic ids still 404 before any lookup
    expect(r.indexOf('id.startsWith("optimistic-")')).toBeLessThan(r.indexOf("deletedIdKey(id))"));
  });

  it("the client treats 204 as success with no body parse", () => {
    expect(read("src/lib/api.ts")).toMatch(/res\.status === 204\) return \{ ok: true, status: 204/);
  });
});

describe("b72 dashboard wiring", () => {
  it("prunes against a fresh /api/transactions before replaying, and clears all entries on a settled delete", () => {
    const d = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(d).toMatch(/\/api\/transactions\?fresh=1[\s\S]{0,400}pruneSettledDeletes\(userId, live\)/);
    expect(d).toMatch(/if \(res\.ok && userId\) clearPendingDeletesFor\(userId, line\.id\)/);
  });

  it("pins the build and the pull-check", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:(fix|g10|m7|h1|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-)?b[78]\d-2026-10-2[78]$/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toMatch(/Goal b72[^\n]*pull-check:v3-b87-2026-10-28/);
  });
});
