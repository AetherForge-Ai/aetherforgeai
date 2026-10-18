import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIF_CORE_RULE, FIF_STATIC_ANSWER, fifStaticReply } from "@/lib/guide-facts";
import { pickServedSnapshot, withDeadline } from "@/lib/ticker-serve";
import { mergeIndexTabs } from "@/lib/public-market-index";
import { QUOTE_DELAY_TABLE } from "@/lib/market-freshness";
import { journalDeletedMap, journalPendingWrite, listPendingWrites, pendingDeleteIds, replayPendingWrites } from "@/lib/write-journal";

const read = (p: string) => readFileSync(p, "utf8");
function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("b38 build", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b38-2026-10-19");
  });
});

describe("b38 G-10: pending deletes", () => {
  it("a journalled delete stays hidden and is replayed until the server answers", async () => {
    const s = mem();
    journalPendingWrite({ key: "d1", userId: "u", method: "DELETE", payload: {}, deleteId: "row-9", at: 0 }, s);
    expect(pendingDeleteIds("u", s)).toEqual(["row-9"]);
    expect(journalDeletedMap("u", s).has("row-9")).toBe(true);
    const flaky = await replayPendingWrites("u", async () => ({ ok: true }), s, 60_000, async () => ({ ok: false, status: 504 }));
    expect(flaky.kept).toBe(1);
    expect(listPendingWrites("u", s)).toHaveLength(1);
    const done = await replayPendingWrites("u", async () => ({ ok: true }), s, 60_000, async () => ({ ok: true, data: { alreadyRemoved: true } }));
    expect(done.saved).toEqual(["row-9"]);
    expect(listPendingWrites("u", s)).toHaveLength(0);
  });
  it("the dashboard journals deletes and replays them", () => {
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash).toMatch(/method: "DELETE", payload: \{\}, deleteId: line\.id/);
    expect(dash).toMatch(/api\.delete\(`\/api\/transactions\?id=\$\{encodeURIComponent\(id\)\}`\)/);
  });
});

describe("b38 CR-2 (P1): exact joint FIF wording", () => {
  const exact =
    "The NZ$50,000 threshold applies per person, based on total cost at any time in the year; joint holdings are split between the owners, so 2 equal owners can together hold up to NZ$100,000 in cost; it's not a doubled threshold for the portfolio.";
  it("the core rule is word for word", () => {
    expect(FIF_CORE_RULE).toBe(exact);
    expect(FIF_STATIC_ANSWER.startsWith(exact)).toBe(true);
  });
  it.each([
    "Is our joint FIF threshold NZ$100,000?",
    "My partner and I hold shares together, does the FIF limit double?",
    "What is the FIF de minimis threshold?",
    "Does the $50k FIF exemption apply per person?",
  ])("guide answer: %s", (q) => {
    const a = fifStaticReply(q) || "";
    expect(a).toContain(exact);
    expect(a.trim().endsWith("Indicative, not tax advice.")).toBe(true);
    expect(a).not.toMatch(/threshold (is|becomes) doubled|doubles to/i);
  });
  it("the general FIF answer (/learn) uses the same wording", () => {
    expect(read("src/data/learn-content.ts")).toContain(exact);
    expect(read("src/lib/guide-facts.ts")).toMatch(/Use this wording: "\$\{FIF_CORE_RULE\}"/);
  });
});

describe("b38 REG-1 / H-1: never hang, never step back, never 503 with a copy", () => {
  it("serves the newest of the read and the isolate's last good copy", () => {
    expect(pickServedSnapshot(null, { version: 5 })).toEqual({ version: 5 });
    expect(pickServedSnapshot({ version: 4 }, { version: 5 })).toEqual({ version: 5 });
    expect(pickServedSnapshot({ version: 6 }, { version: 5 })).toEqual({ version: 6 });
    expect(pickServedSnapshot(null, null)).toBeNull();
  });
  it("a hung read resolves to the fallback at the deadline", async () => {
    expect(await withDeadline(new Promise<number>(() => {}), 10, -1)).toBe(-1);
    expect(await withDeadline(Promise.reject(new Error("x")), 10, -2)).toBe(-2);
  });
  it("/api/ticker is bounded, falls back to the last good answer, and sends headers on every 200", () => {
    const r = read("src/app/api/ticker/route.ts");
    expect(r).toMatch(/TICKER_ROUTE_DEADLINE_MS/);
    expect(r).toMatch(/lastGoodResponse/);
    expect(r).toMatch(/"x-af-snapshot-version": "0"/);
  });
  it("/markets bounds the session and index reads", () => {
    const p = read("src/app/markets/page.tsx");
    expect(p).toMatch(/withDeadline\(getCurrentUser\(\), MARKETS_SSR_DEADLINE_MS, null\)/);
  });
  it("a rebuild never empties a tab that had rows", () => {
    const tab = (id: string, n: number) => ({ id, title: id, asOf: "", rows: Array.from({ length: n }, () => ({}) as never) });
    const prev = { tabs: [tab("NZX", 5), tab("CRYPTO", 20)], priceRowCount: 25 };
    const fresh = { tabs: [tab("NZX", 30), tab("CRYPTO", 0)], priceRowCount: 30 };
    const merged = mergeIndexTabs(fresh, prev);
    expect(merged.tabs.find((t) => t.id === "CRYPTO")!.rows).toHaveLength(20);
    expect(merged.priceRowCount).toBe(50);
  });
});

describe("b38 H-15 / M-3 / headers", () => {
  it("/trust delay list names every live crypto source", () => {
    const crypto = QUOTE_DELAY_TABLE.find((r) => r.market === "Crypto")!.source;
    for (const name of ["CoinGecko", "CoinPaprika", "CoinCap", "Binance", "Kraken", "Coinbase", "Yahoo Finance"]) expect(crypto).toContain(name);
    expect(QUOTE_DELAY_TABLE.some((r) => /GeckoTerminal/.test(r.source))).toBe(true);
  });
  it("intros do not repeat a sentence", () => {
    expect(read("src/app/smitty/page.tsx")).not.toMatch(/not a fourth AI bot/);
    expect(read("src/app/headmaster/page.tsx").match(/Signed-out visitors see this explanation/g) ?? []).toHaveLength(0);
    expect(read("src/app/koins/page.tsx").match(/Crypto projections stay paused/g) ?? []).toHaveLength(1);
  });
  it("static files get a Content-Type", () => {
    const h = read("public/_headers");
    expect(h).toMatch(/\/site\.webmanifest\n {2}Content-Type: application\/manifest\+json/);
    expect(h).toMatch(/\/favicon\.ico\n {2}Content-Type: image\/x-icon/);
    expect(h).toMatch(/\/brand\/[^\n]+\.png\n {2}Content-Type: image\/png/);
  });
});
