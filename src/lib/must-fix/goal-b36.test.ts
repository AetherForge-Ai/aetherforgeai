// pull-check:v3-goal-b36-2026-10-19
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";

vi.mock("server-only", () => ({}));
const read = (p: string) => readFileSync(p, "utf8");

describe("b36 M-9 (GOAL-LOCK #19): owner admin", () => {
  it("only the privacy-officer account is the owner", async () => {
    const { isOwner } = await import("@/lib/owner-admin");
    expect(isOwner({ email: " Lukas@AetherForgeAI.co.nz " })).toBe(true);
    expect(isOwner({ email: "member@example.com" })).toBe(false);
    expect(isOwner(null)).toBe(false);
  });
  it("summary is counts only: sign-ups 7/30 days, plans, AI messages, reports", async () => {
    const { summariseOwnerRows } = await import("@/lib/owner-admin");
    const now = Date.parse("2026-10-19T00:00:00Z");
    const d = (days: number) => new Date(now - days * 86_400_000).toISOString();
    const s = summariseOwnerRows(
      [{ createdAt: d(1), subscription_plan: "free" }, { createdAt: d(10), subscription_plan: "monthly" }, { createdAt: d(40), subscription_plan: "free" }],
      [{ createdAt: d(2) }, { createdAt: d(31) }],
      [{ createdAt: d(5) }],
      now,
      (p) => p || "none"
    );
    expect(s).toEqual({ users: 3, capped: false, signups7d: 1, signups30d: 2, plans: { free: 2, monthly: 1 }, assistantMessages30d: 1, reports30d: 1 });
  });
  it("/admin 404s for anyone but the owner, audits views, shows no names or emails", () => {
    const page = read("src/app/admin/page.tsx");
    expect(page).toMatch(/if \(!isOwner\(user\)\) notFound\(\)/);
    expect(page).toMatch(/\[admin-audit\]/);
    expect(page).not.toMatch(/\.email\}|\.name\}/);
  });
  it("every /api/admin route refuses a normal user (404 or 401) and actions are audited", () => {
    const dirs = readdirSync("src/app/api/admin", { recursive: true }) as string[];
    const routes = dirs.filter((p) => p.endsWith("route.ts")).map((p) => `src/app/api/admin/${p}`);
    expect(routes.length).toBeGreaterThanOrEqual(4);
    for (const r of routes) {
      const s = read(r);
      expect(s, r).toMatch(/status: 40[134]|denied\(\)|notFound\(\)/);
    }
    for (const a of ["ledger-reversal", "fx-ledger-correction", "position-maintenance"]) {
      expect(read(`src/app/api/admin/${a}/route.ts`)).toMatch(/\[admin-audit\]/);
    }
  });
});

describe("b36 G-09 (GOAL-LOCK #44): every locked export says 'CSV export: Starter and above'", () => {
  it("each export route refuses Free with 403 and the lock label", () => {
    const routes = [
      "transactions/export", "tax/crypto/export", "tax/dividends/export", "tax/fif/export",
      "tax/income/export", "tax/realised/export", "tax/pack/pdf", "tax/pack/zip",
    ].map((r) => `src/app/api/${r}/route.ts`);
    for (const r of routes) {
      expect(existsSync(r), r).toBe(true);
      const s = read(r);
      expect(s, r).toMatch(/status: 403/);
      expect(s, r).toMatch(/CSV_LOCK_LABEL|CSV export: Starter and above/);
    }
  });
  it("tax pack and Xero buttons use the exact lock wording", () => {
    expect(read("src/components/tax/TaxPageContent.tsx")).toMatch(/\{CSV_LOCK_LABEL\} \(tax pack PDF and ZIP\)/);
    expect(read("src/components/tax/TaxPageContent.tsx")).not.toMatch(/Tax pack: Starter and above/);
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toMatch(/CSV export: Starter and above \(Xero CSV\)/);
    for (const p of ["src/app/tax/fif/page.tsx", "src/app/tax/income/page.tsx", "src/app/tax/realised/page.tsx", "src/components/tax/DividendLedgerView.tsx"]) {
      expect(read(p), p).toMatch(/CsvExportButton|CSV_LOCK_LABEL/);
    }
  });
});

describe("b36 G-12 (GOAL-LOCK #47): FIF rounding, per line then sum", () => {
  it("a 5-holding golden book sums to the printed total to the cent", async () => {
    const { fifTotals } = await import("@/lib/fif-working-paper");
    const rows = [
      { costNzd: 10000.005, fdrNzd: 500.0025, cvNzd: 1234.565 },
      { costNzd: 8000.004, fdrNzd: 400.0049, cvNzd: -210.335 },
      { costNzd: 12500.125, fdrNzd: 625.0063, cvNzd: 999.995 },
      { costNzd: 9999.994, fdrNzd: 499.9997, cvNzd: 0.005 },
      { costNzd: 15000.015, fdrNzd: 750.0008, cvNzd: 3210.104 },
    ];
    const t = fifTotals(rows);
    const cents = (k: "costNzd" | "fdrNzd" | "cvNzd") => rows.reduce((s, r) => s + Math.round(Math.round(r[k] * 100 + 1e-9) ), 0) / 100;
    expect(t.costNzd).toBe(55500.15);
    expect(t.costNzd).toBe(cents("costNzd"));
    expect(t.fdrNzd).toBe(2775.01);
    expect(t.cvNzd).toBe(5234.34);
    expect(fifTotals([...rows, { costNzd: 1, fdrNzd: null, cvNzd: 1 }]).fdrNzd).toBeNull();
  });
});

describe("b36 G-08 (GOAL-LOCK #43): 0.01 oz is shown, not rounded away", () => {
  it("Held uses up to 4 decimals", () => {
    expect((0.01).toLocaleString("en-NZ", { maximumFractionDigits: 4 })).toBe("0.01");
    expect(read("src/components/dashboard/PreciousMetals.tsx")).toMatch(/Held: \{row\.ounces\.toLocaleString\("en-NZ", \{ maximumFractionDigits: 4 \}\)\} oz/);
  });
});

describe("b36 G-07 (GOAL-LOCK #42): pricing caps = enforcement caps", () => {
  it("every 'Up to N holdings' line matches the plan's enforced tickerLimit", async () => {
    const { PLANS, LEGACY_SUBSCRIPTION_PLANS, FREE_PLAN } = await import("@/lib/plans");
    for (const p of [...PLANS, ...LEGACY_SUBSCRIPTION_PLANS, FREE_PLAN as never as { key: string; tickerLimit: number; features: string[] }]) {
      for (const f of p.features || []) {
        const m = /^Up to (\d+) holdings$/.exec(f);
        if (m) expect(Number(m[1]), p.key).toBe(p.tickerLimit);
      }
    }
  });
});
