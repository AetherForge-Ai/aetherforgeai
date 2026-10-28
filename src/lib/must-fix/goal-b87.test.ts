/**
 * b87: H-10 import undo all-or-nothing, G-27 /shared gate, test-hook cleanup. pull-check:v3-b90-2026-10-29
 * Ledger below mirrors TT's live b86 FREE case (batch impf0e3380e7bf9f380); ids are made up for the test.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importRowsByIds, orderImportUndo, planImportUndo, planUndoRows } from "@/lib/import-undo-plan";
import { sharingPageHidden } from "@/lib/route-gate";

const read = (p: string) => readFileSync(p, "utf8");
const B = "impf0e3380e7bf9f380";
const tag = `batch=${B}`;
const base = [
  { _id: "t-base-buy", type: "buy", ticker: "BTC", asset_type: "crypto", quantity: 0.01, price: 7255.23, cash_nzd: -72.55, executed_at: "2026-10-20T01:00:00.000Z", notes: "" },
  { _id: "t-open", type: "opening_balance", quantity: 100, price: 1, cash_nzd: 100, executed_at: "2026-10-19T01:00:00.000Z", notes: "" },
];
const batch = [
  { _id: "t-buy", type: "buy", ticker: "MSFT", quantity: 2, price: 100, cash_nzd: -342.01, executed_at: "2026-10-27T18:15:54.553Z", notes: `pxat=2026-10-27T18:15:54.553Z ${tag}` },
  { _id: "t-dep", type: "deposit", quantity: 314.56, price: 1, cash_nzd: 314.56, executed_at: "2026-10-27T18:15:55.000Z", notes: `Paper cash of NZ$314.56 is recorded because this buy would otherwise make paper cash negative. ${tag}` },
  { _id: "t-sell", type: "sell", ticker: "MSFT", quantity: 1, price: 110, cash_nzd: 181.51, executed_at: "2026-10-27T18:15:55.318Z", notes: `pxat=2026-10-27T18:15:55.318Z ${tag}` },
];

describe("b87 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b90-2026-10-29");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b90-2026-10-29");
  });
});

describe("b87 H-10 import undo is all-or-nothing", () => {
  it("TT case: trades newest first, funding deposit last, cash back to NZ$27.45", () => {
    const plan = planImportUndo({ ledger: [...base, ...batch], batchId: B, cashNzd: 181.51 });
    expect(plan.ok).toBe(true);
    expect(plan.ids).toEqual(["t-sell", "t-buy", "t-dep"]);
    if (plan.ok) expect(plan.cashAfter).toBe(27.45);
  });
  it("the old order (sell, deposit, buy) is never produced", () => {
    expect(orderImportUndo(batch as never).map((r) => r._id)).toEqual(["t-sell", "t-buy", "t-dep"]);
  });
  it("a batch whose cash was spent elsewhere is refused before anything is removed", () => {
    // Later manual buy spent the import cash: undoing the whole batch would go negative.
    const later = { _id: "t-later", type: "buy", ticker: "AIR", quantity: 100, price: 3, cash_nzd: -150, executed_at: "2026-10-28T01:00:00.000Z", notes: "" };
    const plan = planImportUndo({ ledger: [...base, ...batch, later], batchId: B, cashNzd: 31.51 });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toMatch(/Nothing was changed\.$/);
  });
  it("a batch whose shares were sold later is refused (oversell), nothing changed", () => {
    const laterSell = { _id: "t-ls", type: "sell", ticker: "MSFT", quantity: 1, price: 120, cash_nzd: 200, executed_at: "2026-10-28T02:00:00.000Z", notes: "" };
    const plan = planImportUndo({ ledger: [...base, ...batch, laterSell], batchId: B, cashNzd: 381.51 });
    expect(plan.ok).toBe(false);
  });
  it("unknown batch is not found", () => {
    expect(planImportUndo({ ledger: base as never, batchId: B, cashNzd: 27.45 }).ok).toBe(false);
  });
  it("both undo paths plan first and never report a partial refusal", () => {
    for (const p of ["src/lib/import/persist.ts", "src/app/api/import/route.ts"]) {
      const s = read(p);
      expect(s).toContain("planImportUndo({ ledger: stored as never, batchId");
      expect(s.indexOf("planImportUndo(")).toBeLessThan(s.indexOf("undoImportInOrder(\n"));
      expect(s).not.toContain("Undone before this failure");
    }
  });
});

describe("b87 test-hook cleanup", () => {
  it("TT leftover rows (buy + deposit after the sell was undone) clean up deposit last", () => {
    const left = [...base, batch[0], batch[1]];
    const rows = importRowsByIds(left as never, ["t-dep", "t-buy", "t-base-buy"]);
    expect(rows.map((r) => r._id).sort()).toEqual(["t-buy", "t-dep"]); // untagged rows never selected
    const plan = planUndoRows(left as never, rows, 0);
    expect(plan.ok).toBe(true);
    expect(plan.ids).toEqual(["t-buy", "t-dep"]);
    if (plan.ok) expect(plan.cashAfter).toBe(27.45);
  });
  it("hook is allow-listed, dry-run on GET, applies only with apply:true", () => {
    const s = read("src/app/api/test-hooks/import-cleanup/route.ts");
    expect(s).toContain("testHooksAllowedFor");
    expect(s).toContain("body.apply === true");
    expect(s).toMatch(/return run\(user as \{ _id: string \}, sel, false\)/);
    expect(s).not.toMatch(/Math\.random/);
  });
});

describe("b87 G-27 /shared", () => {
  it("is hidden (404) with PORTFOLIO_SHARING off, signed in or out", () => {
    expect(sharingPageHidden("/shared", {})).toBe(true);
    expect(sharingPageHidden("/shared", { PORTFOLIO_SHARING: "on" })).toBe(false);
    expect(sharingPageHidden("/settings", {})).toBe(false);
    const m = read("src/middleware.ts");
    expect(m.indexOf("sharingPageHidden(pathname)")).toBeLessThan(m.indexOf("isSignedInOnlyPage(pathname)) {"));
    expect(read("src/app/shared/page.tsx")).toContain('redirect("/login?redirect=/shared")');
  });
});
