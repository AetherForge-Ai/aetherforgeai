// pull-check:v3-g18-b79-2026-10-27
/** b71 (Chief, 27 Oct 2026): TT b70 P3 — stray DELETE 404s. One DELETE per id; 404 on a gone id is success. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dedupedDelete, deleteSucceeded, isDeleteConfirmed, isDeleteInFlight, resetDeleteDedupe } from "@/lib/delete-dedupe";
import { journalPendingWrite, listPendingWrites, replayPendingWrites } from "@/lib/write-journal";

const read = (p: string) => readFileSync(p, "utf8");

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

beforeEach(() => resetDeleteDedupe());

describe("b71 delete dedupe", () => {
  it("two clicks while the first DELETE is in flight send one request and both see success", async () => {
    const s = memStore();
    let resolve!: (v: { ok: boolean; status: number }) => void;
    const send = vi.fn(() => new Promise<{ ok: boolean; status: number }>((r) => (resolve = r)));
    const a = dedupedDelete("tx1", send, s);
    const b = dedupedDelete("tx1", send, s);
    expect(isDeleteInFlight("tx1")).toBe(true);
    resolve({ ok: true, status: 200 });
    expect((await a).ok).toBe(true);
    expect((await b).ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(isDeleteInFlight("tx1")).toBe(false);
  });

  it("a delete after a confirmed one sends nothing (also after a reload: stored)", async () => {
    const s = memStore();
    await dedupedDelete("tx2", async () => ({ ok: true, status: 200 }), s);
    resetDeleteDedupe(); // a reload clears the tab memory; localStorage remains
    const send = vi.fn(async () => ({ ok: false, status: 404 }));
    const res = await dedupedDelete("tx2", send, s);
    expect(send).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, data: { alreadyRemoved: true } });
    expect(isDeleteConfirmed("tx2", s)).toBe(true);
  });

  it("a 404 for a real id is success, with no console error", async () => {
    const s = memStore();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await dedupedDelete("tx3", async () => ({ ok: false, status: 404, error: "That row was not found." }), s);
    expect(res).toMatchObject({ ok: true, status: 200, data: { alreadyRemoved: true } });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("a 404 for an optimistic id, or a 409/500, is not success and is not remembered", async () => {
    const s = memStore();
    expect(deleteSucceeded("optimistic-1", { ok: false, status: 404 })).toBe(false);
    const res = await dedupedDelete("tx4", async () => ({ ok: false, status: 409, error: "blocked" }), s);
    expect(res.ok).toBe(false);
    expect(isDeleteConfirmed("tx4", s)).toBe(false);
    const send = vi.fn(async () => ({ ok: true, status: 200 }));
    await dedupedDelete("tx4", send, s);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a queued (journal) DELETE for an id already removed is cleared without a request", async () => {
    const s = memStore();
    await dedupedDelete("tx5", async () => ({ ok: true, status: 200 }), s);
    journalPendingWrite({ key: "k5", userId: "u1", method: "DELETE", payload: {}, deleteId: "tx5", at: Date.now() - 60_000 }, s);
    const send = vi.fn(async () => ({ ok: false, status: 404 }));
    const out = await replayPendingWrites("u1", async () => ({ ok: false }), s, Date.now(), (id) => dedupedDelete(id, send, s));
    expect(send).not.toHaveBeenCalled();
    expect(out.saved).toContain("tx5");
    expect(listPendingWrites("u1", s)).toHaveLength(0);
  });

  it("every transactions DELETE call site goes through dedupedDelete", () => {
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash.match(/dedupedDelete\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(read("src/components/tax/DividendLedgerView.tsx")).toMatch(/dedupedDelete\(id,/);
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toMatch(/dedupedDelete\(savedId,/);
    for (const f of ["src/components/dashboard/PortfolioDashboard.tsx", "src/components/tax/DividendLedgerView.tsx", "src/components/dashboard/RecordTransactionPanel.tsx"]) {
      const lines = read(f).split("\n");
      lines.forEach((line, i) => {
        if (/api\.delete[^\n]*\/api\/transactions\?id=/.test(line)) expect(`${lines[i - 1] || ""}\n${line}`).toMatch(/dedupedDelete\([^\n]*\(\) =>/);
      });
    }
  });

  it("G-10 confirm path untouched: the optimistic branch is as b70 left it", () => {
    const src = read("src/components/dashboard/PortfolioDashboard.tsx");
    const optimistic = src.slice(src.indexOf("if (updated?.optimistic) {"), src.indexOf("if (updated?.optimisticRollback)"));
    expect(optimistic).toMatch(/bumpHoldingsGeneration\(\)/);
    expect(optimistic).not.toMatch(/dedupedDelete/);
  });

  it("pins the build and the pull-check", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(del404|fix|g10|m7|h1|cr6|g18)-b7\d-2026-10-2[78]$/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toMatch(/Goal b71[^\n]*pull-check:v3-g18-b79-2026-10-27/);
  });
});
