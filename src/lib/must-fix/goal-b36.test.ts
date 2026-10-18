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

describe("b36 G-20 (GOAL-LOCK #55): 'built by schedule' from the last 3 cron runs", () => {
  const e = (at: string, builtBy: "schedule" | "seed", h = at) => ({ at, builtBy, durationMs: 1000, calls: 3, scorecardHash: h });
  it("the run log keeps the last 3 scheduled runs and the newest seed run, newest first", async () => {
    const { appendRunLog } = await import("@/lib/track-record-store");
    let log = [] as ReturnType<typeof appendRunLog>;
    for (const at of ["2026-10-18T00:00:00Z", "2026-10-18T06:00:00Z", "2026-10-18T12:00:00Z", "2026-10-18T18:00:00Z"]) log = appendRunLog(log, e(at, "schedule"));
    log = appendRunLog(log, e("2026-10-18T19:00:00Z", "seed"));
    expect(log.map((x) => `${x.builtBy}@${x.at.slice(11, 13)}`)).toEqual(["seed@19", "schedule@18", "schedule@12", "schedule@06"]);
  });
  it("label says 'built by schedule' only when a scheduled run stored that exact card", async () => {
    const { builtByLabel } = await import("@/lib/track-record-store");
    const log = [e("2026-10-18T18:00:00Z", "schedule", "abc"), e("2026-10-18T19:00:00Z", "seed", "def")];
    expect(builtByLabel(log, "abc")).toBe("built by schedule");
    expect(builtByLabel(log, "def")).toBe("stored by the seed");
    expect(builtByLabel(log, "zzz")).toBe("stored");
  });
  it("the cron stores builtBy schedule with its duration; the seed stores builtBy seed", () => {
    expect(read("src/app/api/cron/track-record/route.ts")).toMatch(/builtBy: "schedule", durationMs: Date\.now\(\) - started/);
    expect(read("src/lib/track-record-seed.server.ts")).toMatch(/builtBy: "seed"/);
  });
  it("GitHub runs are read server-side only with a token, which is never logged or returned", async () => {
    const { lastCronRuns } = await import("@/lib/cron-runs.server");
    expect(await lastCronRuns({})).toBeNull();
    let auth = "";
    const fake = (async (_u: string, init?: RequestInit) => {
      auth = String((init?.headers as Record<string, string>).Authorization);
      return new Response(JSON.stringify({ workflow_runs: [{ run_started_at: "2026-10-18T16:00:00Z", updated_at: "2026-10-18T16:00:42Z", conclusion: "success", event: "schedule" }] }), { status: 200 });
    }) as typeof fetch;
    const runs = await lastCronRuns({ GITHUB_ACTIONS_READ_TOKEN: "t0k" }, fake);
    expect(auth).toBe("Bearer t0k");
    expect(runs).toEqual([{ at: "2026-10-18T16:00:00Z", conclusion: "success", durationS: 42, event: "schedule" }]);
    expect(JSON.stringify(runs)).not.toMatch(/t0k/);
    const src = read("src/lib/cron-runs.server.ts");
    expect(src).not.toMatch(/console\.\w+\([^)]*token/);
    expect(await lastCronRuns({ GITHUB_ACTIONS_READ_TOKEN: "t0k" }, (async () => new Response("no", { status: 401 })) as typeof fetch)).toBeNull();
  });
  it("the test view shows who built the card and the last 3 runs, falling back to the rows' timestamps", () => {
    const page = read("src/app/test-hooks/track-record/page.tsx");
    expect(page).toMatch(/data-track-built-by/);
    expect(page).toMatch(/ghRuns \? "github-actions" : "track-record-rows"/);
    expect(page).not.toMatch(/GITHUB_ACTIONS_READ_TOKEN/);
  });
  it("the run-log row is hidden like the scorecard rows", async () => {
    const { isTrackScorecardTicker, TRACK_RUN_LOG_TICKER } = await import("@/lib/track-record-store");
    expect(isTrackScorecardTicker(TRACK_RUN_LOG_TICKER)).toBe(true);
  });
});
