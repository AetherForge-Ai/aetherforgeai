// pull-check:v3-goal-b46-2026-10-19
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reevaluateRowDelay, rowAsOfNow } from "@/lib/row-delay-label";

const read = (p: string) => readFileSync(p, "utf8");
const route = () => read("src/app/api/ticker/route.ts");

describe("b46 H-1 (a): every 503 path is logged; snapshot served before the deadline", () => {
  it("logs the path of every 503 and serves memory/colo copies first", () => {
    const r = route();
    expect(r).toContain("503 path=no-copy-anywhere");
    expect(r).toContain("503 path=test-feed-off");
    expect(r).toContain("path=last-good-colo");
    expect(r.match(/status: 503/g)?.length).toBe(2);
    expect(r).toContain("EARLY_SNAPSHOT_MS = 2_000");
    expect(r).toMatch(/firstNonNull<\{ snap: CryptoSnap; path: TickerPath \}>\(\[edge, durable\]/); // b48
  });
});

describe("b46 H-1 (b): delayed is re-evaluated at build and render time", () => {
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  const fresh = new Date(Date.now() - 60_000).toISOString();
  it("a row cached fresh becomes delayed once 15 min pass", () => {
    const row = { asOf: "as of 19 Oct 2026, 2:05 pm", quotedAt: old, delayed: false };
    expect(rowAsOfNow(row).asOf).toBe("as of 19 Oct 2026, 2:05 pm · delayed");
    expect(rowAsOfNow(row).delayed).toBe(true);
  });
  it("a fresh row loses a stale delayed mark; non-crypto tabs untouched", () => {
    const idx = { tabs: [
      { id: "CRYPTO", rows: [{ asOf: "as of x · delayed", quotedAt: fresh, delayed: true }] },
      { id: "DEX", rows: [{ asOf: "as of y", quotedAt: old }] },
      { id: "NZX", rows: [{ asOf: "as of z", quotedAt: old }] },
    ] };
    const out = reevaluateRowDelay(idx);
    expect(out.tabs[0].rows[0].asOf).toBe("as of x");
    expect(out.tabs[1].rows[0].asOf).toBe("as of y · delayed");
    expect(out.tabs[2].rows[0].asOf).toBe("as of z");
  });
  it("the markets table renders through the client re-evaluator", () => {
    expect(read("src/components/markets/PublicMarketTables.tsx")).toContain("<RowAsOf");
    expect(read("src/lib/public-market-index.ts")).toContain("return reevaluateRowDelay(memo.value);");
  });
});

describe("b46 H-1 (c) and (4)", () => {
  it("serves the floor version from the colo copy", () => {
    expect(route()).toContain("edgeSnapshotGetVersion<CryptoSnap>(floor)");
    expect(read("src/lib/ticker-serve.ts")).toContain("EDGE_SNAP_VERSION_KEY(snap.version)");
  });
  it("merges previous equity rows from the colo copy on a failed fetch", () => {
    expect(route()).toContain('edgeJsonGet<EquityRows>("equity", 400)');
  });
});

describe("b46 workflows", () => {
  it("signout-race.yml is dispatch-only and reads the secrets as env without echoing them", () => {
    const y = read(".github/workflows/signout-race.yml");
    expect(y).toMatch(/on:\n  workflow_dispatch:\npermissions/);
    expect(y).toContain("secrets.FIXTURE_EMAIL");
    expect(y).toContain("secrets.FIXTURE_PASSWORD");
    expect(y).not.toMatch(/echo .*\$FIXTURE_(EMAIL|PASSWORD)\b(?! ]| \])/);
    expect(y).toContain("actions/upload-artifact@v4");
  });
  it("h4-playwright.yml uses H4_EMAIL/H4_PASSWORD the same way and uploads its log", () => {
    const y = read(".github/workflows/h4-playwright.yml");
    expect(y).toContain("secrets.H4_EMAIL");
    expect(y).toContain("actions/upload-artifact@v4");
  });
});

describe("b46 P3", () => {
  it("bare /compare redirects; date field shows its focused part", () => {
    expect(existsSync("src/app/compare/page.tsx")).toBe(true);
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain("focus-visible:opacity-100");
  });
  it("build marker", () => {
    expect(read("public/build-version.txt")).toContain("v3-g24-b68-2026-10-27");
  });
});
