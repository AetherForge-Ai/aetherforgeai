import { readFileSync } from "node:fs";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { alignedAsOf, storedBenchmarks } from "@/lib/benchmark-history";
import { classifyTableError } from "@/lib/ip-rate-limit";
import { CRYPTO_REQUEST_REFRESH_MS, cryptoListOlderThan } from "@/lib/crypto-source";
import { withCashDelta } from "@/lib/portfolio-snapshot";
import { FIXTURE_500_LABEL, fixture500Rows, fixture500Snapshot } from "@/lib/fixture-500";

const read = (p: string) => readFileSync(p, "utf8");

describe("goal b18", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-b(1[89]|[2-9][0-9])[a-z]?-/));

  it("G-10: optimistic cash moves cash, net worth and grand to 2dp", () => {
    const snap = fixture500Snapshot();
    const next = withCashDelta(snap, -12.5);
    expect(next.kpis.cash.value).toBeCloseTo((snap.kpis.cash.value ?? 0) - 12.5, 2);
    expect(next.kpis.netWorth.value).toBeCloseTo((snap.kpis.netWorth.value ?? 0) - 12.5, 2);
    expect(next.kpis.cash.display).toMatch(/^-?NZ\$[\d,]+\.\d{2}$/);
  });

  it("G-10: refetch never clears the list; deletes are optimistic", () => {
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash).toMatch(/lastMutationAtRef/);
    expect(dash).toMatch(/withCashDelta\(/);
    const tab = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tab).toMatch(/lastSnapshotRef/);
    const ledger = read("src/components/tax/DividendLedgerView.tsx");
    const del = ledger.slice(ledger.indexOf("removeDividend"));
    expect(del.slice(0, 2500)).not.toMatch(/router\.refresh\(\)/);
    expect(ledger).toMatch(/removedRef/);
  });

  it("CR-2: names the schema and classifies missing columns safely", () => {
    const src = read("src/lib/durable-counter.server.ts");
    for (const f of ["bucket_key", "count", "expires_at"]) expect(src).toContain(`field: "${f}"`);
    expect(classifyTableError(new Error("columns missing=count,expires_at"))).toBe("error:columns(missing=count,expires_at)");
    expect(classifyTableError(new Error("columns present, filter on bucket_key returned nothing"))).toBe("error:columns(filter-ignored)");
  });

  it("crypto: 5-minute request refresh with a single-flight guard", () => {
    expect(CRYPTO_REQUEST_REFRESH_MS).toBe(300_000);
    const now = Date.parse("2026-10-18T00:10:00Z");
    expect(cryptoListOlderThan("2026-10-18T00:04:00Z", CRYPTO_REQUEST_REFRESH_MS, now)).toBe(true);
    expect(cryptoListOlderThan("2026-10-18T00:06:00Z", CRYPTO_REQUEST_REFRESH_MS, now)).toBe(false);
    expect(read("src/lib/crypto-source.ts")).toMatch(/cryptoRequestRefresh/);
    expect(read("src/lib/status-feeds.server.ts")).toMatch(/readSharedCryptoAttempt/);
  });

  it("G-02: asOf aligns to the last close and NZX 50 source has no conversion wording", () => {
    const b = storedBenchmarks();
    const nzx = b.find((x) => /nzx/i.test(x.name ?? x.id ?? "")) ?? b[0];
    expect(alignedAsOf(nzx)).toBe(nzx.asOf);
    expect(alignedAsOf(nzx, "2099-01-01")).toBe(nzx.asOf);
    expect(JSON.stringify(nzx.source ?? "")).not.toMatch(/converted to NZ\$/i);
  });

  it("M-1: dialog host and coach chat load lazily", () => {
    expect(read("src/app/layout.tsx")).toMatch(/LazyTransactionDialogHost/);
    expect(read("src/components/portfolio-coach/PortfolioCoach.tsx")).toMatch(/ssr: false/);
  });

  it("H-4: 500 synthetic example rows, labelled, nothing saved", () => {
    expect(fixture500Rows()).toHaveLength(500);
    expect(fixture500Snapshot().ledger.length).toBe(500);
    expect(FIXTURE_500_LABEL).toMatch(/Example data/);
    expect(read("src/components/dashboard/Fixture500Client.tsx")).not.toMatch(/fetch\(/);
  });

  it("CR-6: test-hooks runs the signed-in dry run", () => {
    expect(read("src/components/TestHooksPanel.tsx")).toContain("/api/transactions?dryRun=1");
  });
});
