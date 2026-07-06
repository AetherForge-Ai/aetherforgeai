/**
 * Renders a self-contained "Total Portfolio Intelligence Report" as a single
 * HTML document (inline styles, no external assets) so it can be opened in a
 * new tab, printed to PDF, or emailed. Pure function of the synthesis + an
 * optional strategy blueprint. Safe on client and server.
 */

import type { TotalumSynthesis, StrategyBlueprint } from "@/lib/totalum-engine";

function nzd(v: number): string {
  return `NZ$${Math.round(v).toLocaleString()}`;
}
function pct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

export function renderTotalumReport(
  synthesis: TotalumSynthesis,
  opts: { memberName?: string; strategy?: StrategyBlueprint | null } = {}
): string {
  const s = synthesis;
  const gainColor = s.totalGainNZD >= 0 ? "#059669" : "#dc2626";
  const date = new Date(s.asOf).toLocaleString("en-NZ", { dateStyle: "long", timeStyle: "short" });

  const allocRows = s.classAllocation
    .map(
      (c) => `
      <tr>
        <td><span class="dot" style="background:${c.color}"></span>${esc(c.label)}</td>
        <td class="num">${c.weight.toFixed(1)}%</td>
        <td class="num">${nzd(c.valueNZD)}</td>
        <td class="num">${c.positions}</td>
      </tr>`
    )
    .join("");

  const posRows = s.positions
    .map(
      (p) => `
      <tr>
        <td><strong>${esc(p.label)}</strong>${p.sublabel ? `<div class="sub">${esc(p.sublabel)}</div>` : ""}</td>
        <td>${esc(p.assetClass)}</td>
        <td class="num">${p.weight.toFixed(1)}%</td>
        <td class="num">${nzd(p.valueNZD)}</td>
        <td class="num" style="color:${p.gainNZD >= 0 ? "#059669" : "#dc2626"}">${pct(p.gainPct)}</td>
      </tr>`
    )
    .join("");

  const scenarioRows = s.scenarios
    .map(
      (sc) => `
      <tr>
        <td><strong>${sc.horizon}</strong></td>
        <td class="num" style="color:#059669">${pct(sc.bullPct)} · ${nzd(sc.bullValue)}</td>
        <td class="num">${pct(sc.basePct)} · ${nzd(sc.baseValue)}</td>
        <td class="num" style="color:#dc2626">${pct(sc.bearPct)} · ${nzd(sc.bearValue)}</td>
      </tr>`
    )
    .join("");

  const stressRows = s.stressTests
    .map(
      (t) => `
      <tr>
        <td><strong>${esc(t.name)}</strong><div class="sub">${esc(t.description)}</div></td>
        <td class="num" style="color:${t.impactNZD >= 0 ? "#059669" : "#dc2626"}">${pct(t.impactPct)}</td>
        <td class="num" style="color:${t.impactNZD >= 0 ? "#059669" : "#dc2626"}">${nzd(t.impactNZD)}</td>
        <td class="num">${nzd(t.newValueNZD)}</td>
      </tr>`
    )
    .join("");

  const risks = s.concentrationRisks.length
    ? `<ul>${s.concentrationRisks.map((r) => `<li><strong>${esc(r.label)}</strong> — ${esc(r.note)}</li>`).join("")}</ul>`
    : `<p class="muted">No single-name or asset-class concentration risks detected. Nicely balanced.</p>`;

  const correlation = `<ul>${s.correlationNotes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;

  const strategyBlock = opts.strategy
    ? `
    <section>
      <h2>Recommended Strategy · ${esc(opts.strategy.name)}</h2>
      <p>${esc(opts.strategy.narrative)}</p>
      <p class="muted">Target: ${Object.entries(opts.strategy.targets)
        .map(([k, v]) => `${k} ${v}%`)
        .join(" · ")} · Projected ≈${opts.strategy.projectedReturnPct}% return @ ≈${opts.strategy.projectedVolPct}% vol</p>
      <table>
        <thead><tr><th>Asset class</th><th class="num">Current</th><th class="num">Target</th><th>Action</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${opts.strategy.rebalance
            .map(
              (m) => `<tr>
              <td>${esc(m.label)}</td>
              <td class="num">${m.currentWeight.toFixed(1)}%</td>
              <td class="num">${m.targetWeight}%</td>
              <td>${m.action === "hold" ? "Hold" : m.action === "buy" ? "Buy ▲" : "Trim ▼"}</td>
              <td class="num">${m.action === "hold" ? "—" : nzd(m.amountNZD)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div class="cols">
        <div><h3>Entry rules</h3><ul>${opts.strategy.entryRules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
        <div><h3>Exit &amp; risk rules</h3><ul>${opts.strategy.exitRules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
      </div>
    </section>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Total Portfolio Intelligence Report</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#0f172a; margin:0; background:#f8fafc; }
  .page { max-width: 880px; margin: 0 auto; padding: 40px 32px 64px; background:#fff; }
  header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #6366f1; padding-bottom:18px; margin-bottom:26px; }
  .brand { font-size:22px; font-weight:800; letter-spacing:-0.02em; }
  .brand span { color:#6366f1; }
  .tag { font-size:12px; color:#64748b; margin-top:2px; }
  h1 { font-size:26px; margin:0 0 4px; letter-spacing:-0.02em; }
  h2 { font-size:17px; margin:30px 0 12px; padding-bottom:6px; border-bottom:1px solid #e2e8f0; }
  h3 { font-size:14px; margin:14px 0 6px; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0 6px; }
  .kpi { border:1px solid #e2e8f0; border-radius:12px; padding:14px; }
  .kpi .l { font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; }
  .kpi .v { font-size:20px; font-weight:700; margin-top:4px; }
  table { width:100%; border-collapse:collapse; font-size:13px; margin-top:8px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid #eef2f7; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#64748b; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:7px; vertical-align:middle; }
  .sub { font-size:11px; color:#94a3b8; }
  .muted { color:#64748b; font-size:13px; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  ul { margin:6px 0; padding-left:18px; } li { margin:4px 0; font-size:13px; }
  footer { margin-top:36px; padding-top:16px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; }
  @media print { body { background:#fff; } .page { padding:0; } }
</style></head>
<body><div class="page">
  <header>
    <div>
      <div class="brand">Aether<span>Forge</span> · Totalum</div>
      <div class="tag">Master Portfolio Architect</div>
    </div>
    <div style="text-align:right">
      <div class="muted">${esc(opts.memberName || "Member")}</div>
      <div class="muted">${esc(date)}</div>
      <div class="muted">Spot ${s.metalsLive ? "live" : "est."} · base currency NZD</div>
    </div>
  </header>

  <h1>Total Portfolio Intelligence Report</h1>
  <p class="muted">A unified cross-asset view of your equities, crypto and precious metals — synthesised into allocation, risk, scenarios and strategy.</p>

  <div class="kpis">
    <div class="kpi"><div class="l">Total wealth</div><div class="v">${nzd(s.totalValueNZD)}</div></div>
    <div class="kpi"><div class="l">Unrealised P/L</div><div class="v" style="color:${gainColor}">${nzd(s.totalGainNZD)}</div></div>
    <div class="kpi"><div class="l">Diversification</div><div class="v">${s.diversificationScore}/100</div></div>
    <div class="kpi"><div class="l">Exp. return / vol</div><div class="v">${s.expectedAnnualReturnPct}% / ${s.expectedAnnualVolPct}%</div></div>
  </div>

  <section>
    <h2>Asset-Class Allocation</h2>
    <table><thead><tr><th>Class</th><th class="num">Weight</th><th class="num">Value</th><th class="num">Positions</th></tr></thead>
    <tbody>${allocRows}</tbody></table>
    <p class="muted" style="margin-top:8px">Concentration: <strong>${esc(s.concentrationLabel)}</strong> (HHI ${s.hhi}).</p>
  </section>

  <section>
    <h2>Holdings</h2>
    <table><thead><tr><th>Position</th><th>Class</th><th class="num">Weight</th><th class="num">Value</th><th class="num">P/L</th></tr></thead>
    <tbody>${posRows}</tbody></table>
  </section>

  <section>
    <h2>Scenario Simulator</h2>
    <table><thead><tr><th>Horizon</th><th class="num">Bull</th><th class="num">Base</th><th class="num">Bear</th></tr></thead>
    <tbody>${scenarioRows}</tbody></table>
  </section>

  <section>
    <h2>Stress Testing</h2>
    <table><thead><tr><th>Shock</th><th class="num">Impact %</th><th class="num">Impact NZD</th><th class="num">New value</th></tr></thead>
    <tbody>${stressRows}</tbody></table>
  </section>

  <section>
    <h2>Concentration &amp; Correlation Risk</h2>
    ${risks}
    ${correlation}
  </section>

  ${strategyBlock}

  <footer>
    Generated by Totalum — AetherForge AI. Figures are model-based intelligence using transparent capital-market assumptions and live spot/FX where available. This is portfolio intelligence, not personalised financial advice.
  </footer>
</div></body></html>`;
}
