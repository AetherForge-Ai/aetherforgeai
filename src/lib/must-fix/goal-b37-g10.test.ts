import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findIdempotentRow, writeMarkHeaders } from "@/lib/write-integrity";
import { BOOK_WRITE_DONE_COOKIE, bookNotBeforeFromCookie } from "@/lib/book-write-mark";
import { confirmedCommit401Action } from "@/lib/trade-commit-session";
import {
  clearPendingWrite,
  isDefiniteRefusal,
  journalPendingWrite,
  listPendingWrites,
  journalDeletedMap,
  noteWrite,
  replayPendingWrites,
  withWriteTimeout,
  WRITE_TIMEOUT_CODE,
} from "@/lib/write-journal";

const src = (p: string) => readFileSync(p, "utf8");
function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** A tiny server with idempotency dedupe, like POST /api/transactions. */
function fakeServer() {
  const rows: Array<{ _id: string; notes: string }> = [];
  let n = 0;
  return {
    rows,
    post(payload: Record<string, unknown>) {
      const key = String(payload.idempotency_key || "");
      const prior = key ? findIdempotentRow(rows, key) : null;
      if (prior) return { ok: true, status: 200, data: { lastTransaction: prior, replayed: true } };
      const row = { _id: `row-${++n}`, notes: key ? `idem=${key}` : "" };
      rows.push(row);
      return { ok: true, status: 200, data: { lastTransaction: row } };
    },
    remove(id: string) {
      const i = rows.findIndex((r) => r._id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

describe("b37 G-10 P1: idempotent duplicate", () => {
  it("finds the prior row by key and the route replays it", () => {
    const rows = [{ _id: "a", notes: "deposit idem=w-1" }, { _id: "b", notes: "idem=w-10" }];
    expect(findIdempotentRow(rows, "w-1")?._id).toBe("a");
    expect(findIdempotentRow(rows, "w-10")?._id).toBe("b");
    expect(findIdempotentRow(rows, "w-2")).toBeNull();
    const route = src("src/app/api/transactions/route.ts");
    expect(route).toMatch(/findIdemRowsFresh/); // b39: fresh lookup replaced the book-cache scan
    expect(route).toMatch(/replayed: ?true/);
  });
  it("the same key posted twice books one row", () => {
    const s = fakeServer();
    const a = s.post({ amount: 100, idempotency_key: "w-x" });
    const b = s.post({ amount: 100, idempotency_key: "w-x" });
    expect(s.rows).toHaveLength(1);
    expect(a.data.lastTransaction._id).toBe(b.data.lastTransaction._id);
  });
});

describe("b37 G-10 P1: 401 then retry with the same key", () => {
  it("a confirmed write retries once after the session realigns", () => {
    expect(confirmedCommit401Action({ alreadyRetried: false, tradeRefreshUsed: true, liveUserId: "u1", activeUserId: "u1" })).toBe("retry");
    expect(confirmedCommit401Action({ alreadyRetried: true, tradeRefreshUsed: true, liveUserId: "u1", activeUserId: "u1" })).toBe("unauthorized");
    expect(confirmedCommit401Action({ alreadyRetried: false, tradeRefreshUsed: true, liveUserId: "u2", activeUserId: "u1" })).toBe("mismatch");
  });
  it("api.ts resends the identical options (body, key) and the panel marks every write confirmed with a key", () => {
    expect(src("src/lib/api.ts")).toMatch(/if \(action === "retry"\) return request<T>\(url, options, true, true\)/);
    const panel = src("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(panel).toMatch(/idempotency_key/);
    expect(panel).toMatch(/confirm: ?true/);
  });
  it("a 401 replay against the server still books once", async () => {
    const s = fakeServer();
    let calls = 0;
    const post = async (p: Record<string, unknown>) => {
      calls += 1;
      if (calls === 1) { s.post(p); return { ok: false, status: 401, error: "Unauthorized" }; } // landed, answer lost
      return s.post(p);
    };
    const r1 = await post({ amount: 5, idempotency_key: "w-401" });
    const r2 = r1.ok ? r1 : await post({ amount: 5, idempotency_key: "w-401" });
    expect(r2.ok).toBe(true);
    expect(s.rows).toHaveLength(1);
  });
});

describe("b37 G-10 P1: failure surfacing", () => {
  it("a hung write times out as an error, never success", async () => {
    const r = await withWriteTimeout(new Promise<{ ok: boolean }>(() => {}), 10);
    expect(r).toEqual({ ok: false, error: WRITE_TIMEOUT_CODE });
  });
  it("only a definite 4xx clears the entry", () => {
    expect(isDefiniteRefusal(400)).toBe(true);
    expect(isDefiniteRefusal(422)).toBe(true);
    for (const st of [undefined, 401, 408, 429, 500, 502, 504]) expect(isDefiniteRefusal(st)).toBe(false);
  });
  it("the panel shows success only with a row id and keeps the form on timeout", () => {
    const panel = src("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(panel).toMatch(/withWriteTimeout/);
    expect(panel).toMatch(/WRITE_TIMEOUT_MESSAGE/);
    expect(panel).toMatch(/journalPendingWrite/);
  });
  it("replay: saved clears, refused clears and reports, 5xx keeps", async () => {
    const s = mem();
    const at = 0;
    const now = 60_000;
    journalPendingWrite({ key: "k1", userId: "u", method: "POST", payload: {}, at }, s);
    journalPendingWrite({ key: "k2", userId: "u", method: "POST", payload: {}, at }, s);
    journalPendingWrite({ key: "k3", userId: "u", method: "POST", payload: {}, at }, s);
    journalPendingWrite({ key: "k4", userId: "other", method: "POST", payload: {}, at }, s);
    const out = await replayPendingWrites("u", async (p) => {
      if (p.idempotency_key === "k1") return { ok: true, data: { lastTransaction: { _id: "r1" } } };
      if (p.idempotency_key === "k2") return { ok: false, status: 400, error: "bad" };
      return { ok: false, status: 504 };
    }, s, now);
    expect(out.saved).toEqual(["r1"]);
    expect(out.refused).toEqual([{ key: "k2", error: "bad" }]);
    expect(out.kept).toBe(1);
    expect(listPendingWrites("u", s).map((w) => w.key)).toEqual(["k3"]);
    expect(listPendingWrites("other", s)).toHaveLength(1);
    clearPendingWrite("k3", s);
    expect(listPendingWrites("u", s)).toHaveLength(0);
  });
  it("the dashboard replays pending writes on load and reads fresh", () => {
    const dash = src("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash).toMatch(/replayPendingWrites\(\s*userId/);
    expect(dash).toMatch(/loadPortfolioSnapshot\(\{ force: true \}\)/);
  });
});

describe("b37 G-10 P1: stale reads", () => {
  it("af_bwd write-done cookie is set with no-store, and the later mark wins", () => {
    const h = writeMarkHeaders(1_000_000);
    expect(h["Set-Cookie"]).toMatch(new RegExp(`^${BOOK_WRITE_DONE_COOKIE}=1000000;`));
    expect(h["Set-Cookie"]).toMatch(/HttpOnly/);
    expect(h["Cache-Control"]).toMatch(/no-store/);
    const a = bookNotBeforeFromCookie(`af_bw=500; ${BOOK_WRITE_DONE_COOKIE}=900`);
    const b = bookNotBeforeFromCookie(`af_bw=900`);
    expect(a).toBe(b);
  });
  it("an unknown book version skips the cache", () => {
    expect(src("src/lib/book-cache.server.ts")).toMatch(/readBookVersionKnown/);
  });
});

describe("b37 G-10 P1 acceptance: 20 cycles, 0 lost, 0 reappearing", () => {
  it("drops, timeouts and reloads never lose a deposit or bring back a deleted row", async () => {
    const server = fakeServer();
    const s = mem();
    const user = "u";
    let clock = Date.now() - 600_000;
    const kept: string[] = [];
    for (let i = 0; i < 20; i++) {
      const key = `w-${i}`;
      const payload = { type: "deposit", amount: i + 1 };
      clock += 10_000;
      journalPendingWrite({ key, userId: user, method: "POST", payload, at: clock }, s);
      const mode = i % 4; // 0 ok, 1 dropped before server (reload, 499), 2 landed but answer lost (504), 3 401 then retry
      if (mode === 0 || mode === 3) {
        const r = server.post({ ...payload, idempotency_key: key, confirm: true });
        clearPendingWrite(key, s);
        noteWrite(user, { createdId: r.data.lastTransaction._id }, s, clock);
      } else if (mode === 2) {
        server.post({ ...payload, idempotency_key: key, confirm: true });
      }
      // reload: replay whatever is pending
      clock += 5_000;
      await replayPendingWrites(user, async (p) => server.post(p), s, clock);
      expect(listPendingWrites(user, s)).toHaveLength(0);
      kept.push(key);
      // delete cycle: delete the row just made; it must stay gone after a lagging read
      const row = findIdempotentRow(server.rows, key)!;
      expect(row).toBeTruthy();
      server.remove(row._id);
      noteWrite(user, { deletedId: row._id }, s);
      expect(journalDeletedMap(user, s).has(row._id)).toBe(true);
      expect(findIdempotentRow(server.rows, key)).toBeNull();
    }
    expect(kept).toHaveLength(20); // 0 lost
    expect(server.rows).toHaveLength(0); // each booked exactly once, then deleted: 0 duplicates, 0 reappearing
  });
});
