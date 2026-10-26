import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { docsShot } from "@/lib/docs-guides";
import { classifyTableError } from "@/lib/ip-rate-limit";
import { cryptoAgeBand, cryptoFeedKilled, recordCryptoAttempt, readCryptoAttempt } from "@/lib/crypto-attempts";
import { neutraliseRatingWording } from "@/lib/report-copy";
import { withLedgerLine } from "@/lib/portfolio-snapshot";

const read = (p: string) => readFileSync(p, "utf8");

describe("goal b14", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/v3-(?:goal|h1|g24)-b(1[4-9]|[2-9][0-9])[a-z]?-/);
  });
  it("M-2: three new screenshots have alt text", () => {
    for (const slug of ["edit-or-delete-a-row", "income-and-tax-view", "read-price-freshness"]) expect(docsShot(slug)?.alt).toMatch(/^Example:/);
  });
  it("CR-2: table errors map to safe codes", () => {
    expect(classifyTableError(Object.assign(new Error("x"), { status: 403 }))).toBe("error:permission");
    expect(classifyTableError(new Error("Table not found"))).toBe("missing");
    expect(classifyTableError(new Error("durable counter read returned no rows; check rate_limit_counter columns"))).toBe("error:columns");
    expect(classifyTableError(new Error("secret abc"))).toBe("error:other");
  });
  it("CR-2: the isolate-floor 429 carries backends", () => {
    expect(read("src/lib/ip-rate-limit.ts")).toMatch(/store: "memory", keyHash: keyHash\(key\), backends:/);
  });
  it("crypto: attempts are recorded, bands and kill switch", () => {
    recordCryptoAttempt(false, new Error("CoinGecko 429 on /coins/markets"));
    expect(readCryptoAttempt().last?.code).toBe("http-429");
    const now = Date.parse("2026-10-18T00:00:00Z");
    expect(cryptoAgeBand(new Date(now - 20 * 60e3).toISOString(), now)).toBe("amber");
    expect(cryptoAgeBand(new Date(now - 515 * 60e3).toISOString(), now)).toBe("red");
    expect(cryptoFeedKilled({ CRYPTO_FEED_OFF: "on" })).toBe(true);
  });
  it("H-12: capital after a full stop", () => {
    expect(neutraliseRatingWording("Fine. BUY now")).toBe("Fine. Positive signal now");
  });
  it("G-10: a new trade lands in the ledger and replaces its optimistic line", () => {
    const snap = { ledger: [{ id: "optimistic-1" }, { id: "a" }] } as never;
    const out = withLedgerLine(snap, { _id: "b", type: "buy", ticker: "air", quantity: 10, price: 1, trade_date: "2026-10-13" }, -10);
    expect(out.ledger.map((r) => r.id)).toEqual(["b", "a"]);
    expect(out.ledger[0].whenLabel).toBe("13 Oct 2026");
  });
  it("G-10: the cache is not cleared on a change, and mount never nulls the book", () => {
    const src = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(src).toContain("setBookSnapshot((current) => cached ?? current)");
  });
  it("H-4: quota is in the first server HTML", () => {
    expect(read("src/components/dashboard/DashboardSessionShell.tsx")).toContain("data-reports-left-banner");
  });
});
