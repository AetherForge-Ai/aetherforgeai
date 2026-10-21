import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as k from "@/lib/kiwisaver";

const nzd = (c: bigint) => k.formatNzd(c);
const s2 = (years: number, r: k.Rate) =>
  k.projectBalance({ openingBalance: k.cents("20000"), salary: k.cents("85000"), years, rateForYear: k.S2_RATE_FOR_YEAR, priorEmployerRateForYear: k.S2_PRIOR_RATE_FOR_YEAR, netReturn: r });

describe("G-22 (GOAL-LOCK #57) KiwiSaver and NZ Super, Research's exact targets", () => {
  it("S1: $85k monthly → employee $2,975.04, employer net $2,085.84, government $260.72, total $5,321.60", () => {
    const r = k.contributionsForYear({ salary: k.cents("85000"), paysPerYear: 12, employeeRate: k.rate(35, 1000), employerRate: k.rate(35, 1000), esctThreshold: k.cents("87550") });
    expect(nzd(r.perPay)).toBe("$7,083.33");
    expect(nzd(r.employeePerPay)).toBe("$247.92");
    expect(nzd(r.esctPerPay)).toBe("$74.10");
    expect(nzd(r.employee)).toBe("$2,975.04");
    expect(nzd(r.esct)).toBe("$889.20");
    expect(nzd(r.employerNet)).toBe("$2,085.84");
    expect(nzd(r.government)).toBe("$260.72");
    expect(nzd(r.total)).toBe("$5,321.60");
  });
  it("S2: age 30, $20k at 4% → $518,456.89 nominal, $259,242.76 today, range $375,965.22–$727,177.72", () => {
    const net = k.netReturn(k.rate(625, 10000), k.rate(28, 100), k.rate(5, 1000));
    expect(Number(net.n) / Number(net.d)).toBe(0.04);
    const mid = s2(35, net);
    expect(nzd(mid)).toBe("$518,456.89");
    expect(nzd(k.inTodaysDollars(mid, k.rate(2, 100), 35))).toBe("$259,242.76");
    expect(nzd(s2(35, k.rate(25, 1000)))).toBe("$375,965.22");
    expect(nzd(s2(35, k.rate(55, 1000)))).toBe("$727,177.72");
    expect([nzd(s2(1, net)), nzd(s2(2, net)), nzd(s2(3, net))]).toEqual(["$26,118.22", "$32,481.17", "$39,821.14"]);
  });
  it("S3: couple on NZ Super at the published $854.08 → $44,412.16", () => {
    expect(nzd(k.coupleNzSuperNetYear())).toBe("$44,412.16");
  });
  it("rules: ESCT brackets, government cap, half-up", () => {
    expect(k.esctRate(k.cents("18720"))).toEqual(k.rate(105, 1000));
    expect(k.esctRate(k.cents("18721"))).toEqual(k.rate(175, 1000));
    expect(k.esctRate(k.cents("216001"))).toEqual(k.rate(39, 100));
    expect(nzd(k.governmentContribution(k.cents("1042.86")))).toBe("$260.72");
    expect(nzd(k.governmentContribution(k.cents("400")))).toBe("$100.00");
    expect(k.applyRate(BigInt(1), k.rate(1, 2))).toBe(BigInt(1));
  });
  it("UI: 'Illustrative, not financial advice', source dates, no new tables", () => {
    const p = readFileSync("src/components/dashboard/KiwiSaverPanel.tsx", "utf8");
    expect(k.G22_LABEL).toBe("Illustrative, not financial advice.");
    expect(p).toContain("{G22_LABEL}");
    expect(p).toContain("data-g22-sources");
    expect(k.G22_SOURCES.every((s) => s.dated.length > 0 && s.url.startsWith("https://"))).toBe(true);
    expect(p).not.toMatch(/totalumSdk|api\.post/);
  });
});

describe("G-22: government contribution income limit (from 1 July 2025)", () => {
  it("$179,999 gets it; $180,000 gets it (not over); $180,001 gets none", () => {
    const own = k.cents("1042.86");
    expect(nzd(k.governmentContribution(own, k.cents("179999")))).toBe("$260.72");
    expect(nzd(k.governmentContribution(own, k.cents("180000")))).toBe("$260.72");
    expect(nzd(k.governmentContribution(own, k.cents("180001")))).toBe("$0.00");
  });
  it("contributionsForYear applies the limit from salary", () => {
    const base = { paysPerYear: 12, employeeRate: k.rate(35, 1000), employerRate: k.rate(35, 1000) };
    const over = k.contributionsForYear({ ...base, salary: k.cents("180001"), esctThreshold: k.cents("186301.04") });
    expect(over.government).toBe(BigInt(0));
    const at = k.contributionsForYear({ ...base, salary: k.cents("180000"), esctThreshold: k.cents("186300") });
    expect(nzd(at.government)).toBe("$260.72");
  });
});
