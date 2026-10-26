/**
 * b61 TT P2 (attempt 2): /ledger is one 308 hop to the dashboard Transactions tab.
 * pull-check:v3-goal-b61-2026-10-22
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../../next.config";
import { middleware } from "../../middleware";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("b61: /ledger single redirect", () => {
  it("middleware and next.config both send /ledger and /transactions in one 308", async () => {
    const rows = await nextConfig.redirects!();
    for (const path of ["/ledger", "/transactions"]) {
      const res = await middleware(new NextRequest(`https://aetherforgeai.co.nz${path}`));
      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toBe("https://aetherforgeai.co.nz/dashboard?tab=transactions");
      const cfg = rows.filter((r) => r.source === path);
      expect(cfg).toEqual([{ source: path, destination: "/dashboard?tab=transactions", permanent: true }]);
    }
  });

  it("pins the build", () => {
    expect(read("public/build-version.txt")).toContain("v3-g10-b70-2026-10-27");
  });
});
