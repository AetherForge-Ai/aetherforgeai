// b40 goal test (version guard moved to goal-b41)
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PasteTradesBox } from "@/components/import/PasteTradesBox";
import { FIF_CORE_RULE } from "@/lib/guide-facts";
import { TICKER_ROUTE_DEADLINE_MS } from "@/lib/ticker-serve";

const read = (p: string) => readFileSync(p, "utf8");

describe("b40 REG-1 / H-1 (a): deadline serves a snapshot, never a 503 while one exists", () => {
  const route = read("src/app/api/ticker/route.ts");
  it("starts the edge/durable fallback with the build and serves it stale after the deadline", () => {
    expect(route).toMatch(/const fallbackReply = fallbackSnapshot\(trace\)/); // b46
    expect(route).toMatch(/snapshotOnlyResponse\(snap, floor\)/);
    expect(route).toMatch(/"x-af-snapshot-stale": "1"/);
    expect(route.indexOf("snapshotOnlyResponse(snap, floor)")).toBeLessThan(route.lastIndexOf("return noCopyResponse();"));
    expect(TICKER_ROUTE_DEADLINE_MS).toBeLessThanOrEqual(3_000);
  });
  it("H-1 (c): a body below the client's floor is marked stale", () => {
    expect(route).toMatch(/const belowFloor = !!snap && floor > 0 && snap\.version < floor;/);
    expect(route).toMatch(/coldStart \|\| belowFloor/);
    expect(route).toMatch(/lastGoodResponse && lastGoodResponse\.version >= floor/);
  });
  it("/markets fills an empty crypto tab from the snapshot (edge copy first)", () => {
    expect(read("src/app/markets/page.tsx")).toMatch(/await ensureCryptoTab\(built\)/);
    const idx = read("src/lib/public-market-index.ts");
    expect(idx).toMatch(/export async function ensureCryptoTab/);
    expect(idx).toMatch(/edgeSnapshotGet<Snap>\(300\)/);
  });
});

describe("b40 H-1 (b): DEX rows over 15 min are marked delayed", () => {
  it("DEX rows carry delayed and the label", () => {
    const idx = read("src/lib/public-market-index.ts");
    expect(idx).toMatch(/b40 H-1 \(b\): DEX rows/);
    expect(idx.match(/delayed: cryptoRowDelayed/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("b40 CLS /tax, /status, console, CR-2", () => {
  it("compact tape footer reserves its height and carries the feed note inline", () => {
    const t = read("src/components/MarketTicker.tsx");
    expect(t).toMatch(/min-h-\[2\.75rem\][^"]*sm:min-h-\[1\.75rem\]/);
    expect(t).not.toMatch(/<p className="bg-zinc-950 px-3 py-1 text-\[0\.65rem\] text-muted-foreground">\{feedBadge\.why\}<\/p>/);
  });
  it("/status falls back to the colo's last OK time and the edge snapshot", () => {
    const s = read("src/lib/status-feeds.server.ts");
    expect(s).toMatch(/latestSavedEquityAt\(\) \?\? \(await lastOkFor\("equity"\)\)/);
    expect(s).toMatch(/edgeSnapshotGet<\{ version: number; at: string \}>/);
    expect(s).toMatch(/edgeTimePut\("crypto", cryptoAt\)/);
  });
  it("an aborted ticker poll is logged quietly, not as console.error", () => {
    const t = read("src/components/MarketTicker.tsx");
    expect(t).not.toMatch(/console\.error\("\[ticker\] Feed fetch failed:/);
    expect(t).toMatch(/console\.info\("\[ticker\] Feed poll retrying:/);
  });
  it("CR-2 shared paragraph keeps 'with no other FIF holdings'", () => {
    expect(FIF_CORE_RULE).toContain("can together hold up to NZ$100,000 in cost with no other FIF holdings;");
  });
});

describe("b40 G-10: dialog close blocked while saving; fresh cash after a write", () => {
  it("X and Escape can't close the dialog while a write is in flight", () => {
    const d = read("src/components/dashboard/TransactionDialog.tsx");
    expect(d).toMatch(/if \(!next && savingRef\.current && reason !== "explicit"\) return;/);
    expect(d).toMatch(/if \(savingRef\.current\) \{\s*e\.preventDefault\(\);/);
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toMatch(/onSavingChange\?\.\(saving\)/);
  });
  it("the ledger GET skips session cash older than this browser's last write", () => {
    const t = read("src/lib/transactions.ts");
    expect(t).toMatch(/requestWriteNotBefore\(\)/);
    expect(t).toMatch(/wroteAt > 0 && readAt <= wroteAt \? readUserCash/);
  });
});

describe("b40 G-24: visible Paste trades box on /import and the dashboard Import CSV dialog", () => {
  it("renders a labelled textarea and the read button", () => {
    const html = renderToStaticMarkup(createElement(PasteTradesBox, { onCsv: () => undefined, idPrefix: "t" }));
    expect(html).toContain("data-paste-trades");
    expect(html).toContain(">Paste trades</h2>");
    expect(html).toMatch(/<textarea[^>]*aria-label="Paste trades"/);
    expect(html).toContain("Read trades from text");
  });
  it("is wired into both entry points", () => {
    expect(read("src/app/import/import-client.tsx")).toMatch(/<PasteTradesBox[\s\S]*send\("preview", csv(, columnMap)?\)/);
    expect(read("src/components/dashboard/HoldingsCsvImport.tsx")).toMatch(/<PasteTradesBox/);
    expect(read("src/components/import/PasteTradesBox.tsx")).toMatch(/data-paste-row-dates/);
    expect(read("src/components/import/PasteTradesBox.tsx")).toMatch(/Date missing/);
  });
});

describe("b40 G-10 (TT b39 P1): delete during pending", () => {
  it("never sends DELETE for an optimistic id; Delete is disabled until the server id returns", async () => {
    const { isOptimisticId, cancelWriteKey, isCancelledWriteKey, clearCancelledWriteKey } = await import("@/lib/write-journal");
    expect(isOptimisticId("optimistic-123")).toBe(true);
    expect(isOptimisticId("65f0a1b2c3")).toBe(false);
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    cancelWriteKey("w-1", s);
    expect(isCancelledWriteKey("w-1", s)).toBe(true);
    clearCancelledWriteKey("w-1", s);
    expect(isCancelledWriteKey("w-1", s)).toBe(false);
    expect(read("src/components/dashboard/TransactionsTab.tsx")).toMatch(/disabled=\{isOptimisticId\(line\.id\)\}/);
    const d = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(d.indexOf("if (isOptimisticId(line.id))")).toBeLessThan(d.indexOf("api.delete<{ cash?: { after?: number }"));
  });
  it("a POST whose key was cancelled in this tab is deleted on arrival", () => {
    const p = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(p).toMatch(/notes: `idem=\$\{String\(payload\.idempotency_key\)\}`/);
    expect(p).toMatch(/if \(isCancelledWriteKey\(String\(payload\.idempotency_key\)\)\)/);
  });
  it("the server answers 404 for an unknown or optimistic id", () => {
    const r = read("src/app/api/transactions/route.ts");
    expect(r).toMatch(/id\.startsWith\("optimistic-"\)/);
    expect(r).toMatch(/code: "not_found", error: "That row was not found\.", data: \{ alreadyRemoved: true \} \}, \{ status: 404/);
  });
});

describe("b40 (TT b39 P1): sign-out leak", () => {
  it("signed-in-only pages redirect in middleware when there is no session cookie, no-store", () => {
    const m = read("src/middleware.ts");
    expect(m).toMatch(/const SIGNED_IN_ONLY = \["\/settings"/);
    expect(m).toMatch(/!signedIn && request\.method === "GET" && isSignedInOnlyPage\(pathname\)/);
    expect(m).toMatch(/"private, no-store, max-age=0"/);
  });
});
