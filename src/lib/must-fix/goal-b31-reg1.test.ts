import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CoinMarket } from "@/lib/crypto-market";
import {
  STORE_HARD_TIMEOUT_MS,
  installSnapshotDurable,
  persistCryptoSnapshot,
  readCryptoSnapshot,
  resetCryptoSnapshotsForTests,
  flushSnapshotWrites,
  type SnapshotDurable,
} from "@/lib/crypto-snapshot";
import { ledgerCivilDay, withLedgerLine } from "@/lib/portfolio-snapshot";
import { dividendDeleteEffect } from "@/lib/dashboard-tabs";
import { coachStaticFactReply } from "@/lib/portfolio-coach-knowledge";

const read = (p: string) => readFileSync(p, "utf8");

function coins(n: number, price = 100): CoinMarket[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `C${i}`,
    symbol: `C${i}`,
    image: "",
    rank: i + 1,
    price: price + i,
    marketCap: 1_000_000_000 - i,
    fdv: null,
    volume24h: 1000,
    change1h: 0,
    change24h: 0,
    change7d: 0,
    change30d: 0,
    circulatingSupply: 1,
    sparkline7d: [],
    source: "coingecko",
    quotedAt: new Date().toISOString(),
  })) as unknown as CoinMarket[];
}

/** A store that never answers (the REG-1 condition). */
function hangingStore(): SnapshotDurable & { reads: number; writes: number } {
  const s = {
    reads: 0,
    writes: 0,
    read: () => {
      s.reads += 1;
      return new Promise<string | null>(() => undefined);
    },
    write: () => {
      s.writes += 1;
      return new Promise<boolean>(() => undefined);
    },
  };
  return s;
}

afterEach(() => {
  installSnapshotDurable(null);
  resetCryptoSnapshotsForTests();
  vi.useRealTimers();
});

describe("b31 REG-1 / H-1: a slow store never blocks a request", () => {
  it("the hard timeout is about 1.5 s", () => {
    expect(STORE_HARD_TIMEOUT_MS).toBeLessThanOrEqual(1_500);
  });

  it("a cold read with a hanging store returns within the hard timeout", async () => {
    installSnapshotDurable(hangingStore());
    const started = Date.now();
    const snap = await readCryptoSnapshot();
    expect(snap).toBeNull();
    expect(Date.now() - started).toBeLessThan(STORE_HARD_TIMEOUT_MS + 300);
  });

  it("a write never blocks: persist returns at once and memory serves the new list", async () => {
    const store = hangingStore();
    installSnapshotDurable(store);
    const at = new Date().toISOString();
    const started = Date.now();
    // first read times out (cold), persist must not wait on the store write
    await persistCryptoSnapshot(coins(150), at);
    expect(Date.now() - started).toBeLessThan(STORE_HARD_TIMEOUT_MS + 500);
    const t2 = Date.now();
    const snap = await readCryptoSnapshot();
    expect(Date.now() - t2).toBeLessThan(50);
    expect(snap?.at).toBe(at);
    expect(snap?.coins.length).toBe(150);
  });

  it("with a last-good copy in memory, 20 reads in a row never wait on the store", async () => {
    let answer = true;
    const fast: SnapshotDurable = {
      read: () => (answer ? Promise.resolve(null) : new Promise(() => undefined)),
      write: () => Promise.resolve(true),
    };
    installSnapshotDurable(fast);
    await persistCryptoSnapshot(coins(150), new Date().toISOString());
    await flushSnapshotWrites();
    answer = false; // the store now hangs
    for (let i = 0; i < 20; i += 1) {
      const t = Date.now();
      const snap = await readCryptoSnapshot();
      expect(snap?.coins.length).toBe(150);
      expect(Date.now() - t).toBeLessThan(50);
    }
  });

  it("the as-at never steps backwards: an older list does not replace a newer one", async () => {
    installSnapshotDurable({ read: () => Promise.resolve(null), write: () => Promise.resolve(true) });
    const newer = new Date().toISOString();
    const older = new Date(Date.now() - 15 * 60_000).toISOString();
    await persistCryptoSnapshot(coins(150, 200), newer);
    await flushSnapshotWrites();
    await persistCryptoSnapshot(coins(150, 100), older);
    await flushSnapshotWrites();
    const snap = await readCryptoSnapshot();
    expect(snap?.at).toBe(newer);
  });

  it("price APIs are not CDN-cached; the status probe shows the last OK time on a timeout", () => {
    expect(read("src/app/api/crypto/markets/route.ts")).toMatch(/private, max-age=5/);
    expect(read("src/app/api/crypto/markets/route.ts")).toMatch(/CDN-Cache-Control": "no-store"/);
    expect(read("src/app/api/ticker/route.ts")).toMatch(/no-store/);
    const status = read("src/lib/status-feeds.server.ts");
    expect(status).toMatch(/STATUS_PROBE_TIMEOUT_MS = 1_500/);
    expect(status).toMatch(/check timed out/);
    expect(read("next.config.ts")).toMatch(/htmlLimitedBots/);
    expect(read("src/app/status/page.tsx")).toMatch(/snapshotMetaOther/);
    expect(read("src/lib/fx.ts")).toMatch(/AbortSignal\.timeout\(1_500\)/);
  });

  it("G-05: the tape keeps last-good rows and retries; no stuck Loading prices", () => {
    const tape = read("src/components/MarketTicker.tsx");
    expect(tape).toMatch(/AbortSignal\.timeout\(4_000\)/);
    expect(tape).toMatch(/setTimeout\(loadFeed, 15_000\)/);
    expect(tape).toMatch(/Prices are delayed\. Retrying shortly\./);
  });
});

describe("b31 G-10 fixes", () => {
  it("a sell saved in the NZ morning shows the NZ day, with its realised amount", () => {
    // 2026-10-19 07:00 NZDT is 2026-10-18 18:00 UTC
    expect(ledgerCivilDay("2026-10-18T18:00:00.000Z")).toBe("2026-10-19");
    const snap = { ledger: [] } as never;
    const out = withLedgerLine(snap, { _id: "t1", type: "sell", ticker: "AIR.NZ", quantity: 1, price: 1, executed_at: "2026-10-18T18:00:00.000Z", realized_pnl_nzd: 12.345 }, 10) as unknown as { ledger: Array<{ when: string; realisedNzd: number | null }> };
    expect(out.ledger[0].when).toBe("2026-10-19");
    expect(out.ledger[0].realisedNzd).toBe(12.35);
  });
  it("deposit delete copy names the deposit, and the dialog does not repeat Cancel changes nothing", () => {
    expect(dividendDeleteEffect(100, 50, "deposit").reason).toMatch(/deposit's cash impact/);
    expect(dividendDeleteEffect(100, 50, "deposit").reason).not.toMatch(/dividend/);
    const tab = read("src/components/dashboard/TransactionsTab.tsx");
    const dialog = tab.slice(tab.indexOf("<AlertDialog open={pending"), tab.indexOf("<AlertDialog open={editing"));
    expect(dialog.match(/Cancel changes nothing/g)?.length).toBe(1);
  });
  it("the Add panel traps focus and returns it to the trigger", () => {
    const d = read("src/components/dashboard/TransactionDialog.tsx");
    expect(d).toMatch(/onKeyDown=\{trapTab\}/);
    expect(d).toMatch(/returnFocusRef/);
  });
  it("Confirm holds the dialog at most 1.2 s", () => {
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toMatch(/CONFIRM_HOLD_MS = 900/);
  });
});

describe("b31 CR-2: factual answers from static facts", () => {
  it("answers price, paper book and FIF de minimis without a model call", () => {
    expect(coachStaticFactReply("What does the Starter plan cost?")).toMatch(/NZ\$16 per month or NZ\$160 per year/);
    expect(coachStaticFactReply("Is this a paper book? Does it place real trades?")).toMatch(/never executed/);
    expect(coachStaticFactReply("What is the FIF de minimis?")).toMatch(/NZ\$50,000.*NZ\$100,000/s);
    expect(coachStaticFactReply("How do I add a holding?")).toBeNull();
  });
  it("no speed or accuracy claims, and slow reads are bounded", () => {
    const route = read("src/app/api/portfolio-coach/route.ts");
    expect(route).toMatch(/COACH_READ_TIMEOUT_MS = 1_500/);
    expect(route).toMatch(/COACH_MODEL_TIMEOUT_MS = 7_000/);
    expect(read("src/lib/portfolio-coach-knowledge.ts")).toMatch(/never say AetherForge.*fast, quick, instant, accurate/);
    expect(read("src/lib/personal-guide-knowledge.ts")).toMatch(/never say AetherForge.*fast, quick, instant, accurate/);
  });
});
