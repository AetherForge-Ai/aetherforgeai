/**
 * Full HTML report renderer — shows the complete technical analysis
 * produced by the same engine that powers the AetherForge website.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { KoinsReport, FullHoldingAnalysis } from "./types.js";
import type { SecurityIntel } from "./market-intel.js";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(v: number, currency = ""): string {
  const prefix = currency ? `${currency} ` : "";
  return prefix + v.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v: number): string {
  return `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
}

function pctColor(v: number): string {
  return v > 0 ? "#059669" : v < 0 ? "#dc2626" : "#64748b";
}

function signalColor(s: string): string {
  if (s === "BUY" || s === "Strong Buy" || s === "Accumulate") return "#059669";
  if (s === "SELL" || s === "Reduce") return "#dc2626";
  if (s === "Watch") return "#d97706";
  return "#7c3aed"; // HOLD etc
}

function miniSpark(points: { price: number }[], positive: boolean): string {
  if (!points.length) return "";
  const W = 220;
  const H = 48;
  const values = points.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`)
    .join(" ");
  const stroke = positive ? "#059669" : "#dc2626";
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}


function renderOutlook(i: SecurityIntel): string {
  if (!i.outlook) return "";
  const keys = ["base", "bull", "bear"] as const;
  const cards = keys.map((key) => {
    const c = i.outlook[key];
    if (!c) return "";
    const col = c.label === "Bull" ? "#059669" : c.label === "Bear" ? "#dc2626" : "#64748b";
    return (
      '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc;">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">' +
      esc(c.label) + " · " + c.probability + "%</div>" +
      '<div style="font-size:14px;font-weight:800;color:' + col + ';margin-top:2px;">' +
      pct(c.lowPct) + " → " + pct(c.highPct) + "</div>" +
      '<div style="font-size:11px;color:#64748b;margin-top:2px;">' +
      money(c.lowPrice) + " – " + money(c.highPrice) + "</div></div>"
    );
  }).join("");
  return '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' + cards + "</div>";
}

function holdingCard(h: FullHoldingAnalysis): string {
  const i: SecurityIntel = h.intel;
  const histPositive = (i.change30d ?? 0) >= 0;

  return `
  <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin:16px 0;background:#fff;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="font-size:18px;font-weight:800;color:#0f172a;">
          ${esc(i.ticker)}
          <span style="display:inline-block;margin-left:8px;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;color:${signalColor(i.signal)};background:${signalColor(i.signal)}18;border:1px solid ${signalColor(i.signal)}44;">${esc(i.signal)}</span>
          ${h.usedRealHistory ? `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;">LIVE SERIES</span>` : `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;color:#64748b;background:#f1f5f9;border:1px solid #e2e8f0;">MODELLED</span>`}
        </div>
        <div style="font-size:13px;color:#64748b;margin-top:2px;">${esc(i.name)} · ${esc(i.sector)} · ${esc(i.market)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-family:ui-monospace,monospace;font-size:16px;font-weight:700;color:#0f172a;">${money(i.price, i.currency)}</div>
        <div style="font-size:12px;color:${pctColor(i.change1d)};">${pct(i.change1d)} today</div>
      </div>
    </div>

    <!-- Position economics -->
    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px;">
      <tr>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Position</div>
          <div style="font-weight:700;margin-top:2px;">${h.holding.quantity.toLocaleString()} @ ${money(h.holding.avgPrice)}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Market value</div>
          <div style="font-weight:700;margin-top:2px;">${money(h.marketValue, i.currency)}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Unrealised P&amp;L</div>
          <div style="font-weight:700;margin-top:2px;color:${pctColor(h.pnl)};">${h.pnl >= 0 ? "+" : ""}${money(h.pnl)} (${pct(h.pnlPct)})</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Conviction</div>
          <div style="font-weight:700;margin-top:2px;">${esc(i.conviction)}</div>
        </td>
      </tr>
    </table>

    <!-- Performance windows -->
    <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;">
      <tr>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">1 Day</div>
          <div style="font-weight:800;color:${pctColor(i.change1d)};">${pct(i.change1d)}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">7 Days</div>
          <div style="font-weight:800;color:${pctColor(i.change7d)};">${pct(i.change7d)}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">30 Days</div>
          <div style="font-weight:800;color:${pctColor(i.change30d)};">${pct(i.change30d)}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:25%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">7d Projection</div>
          <div style="font-weight:800;color:${pctColor(i.projected7dPct)};">${pct(i.projected7dPct)} <span style="font-size:10px;font-weight:600;color:#94a3b8;">(${i.confidence}%)</span></div>
        </td>
      </tr>
    </table>

    <!-- Technicals -->
    <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px;">
      <tr>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:20%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">RSI (14)</div>
          <div style="font-weight:700;">${i.rsi != null ? i.rsi.toFixed(0) : "—"}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:20%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">MACD</div>
          <div style="font-weight:700;color:${i.macdSignal === "Bullish" ? "#059669" : i.macdSignal === "Bearish" ? "#dc2626" : "#64748b"};">${esc(i.macdSignal ?? "—")}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:20%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">vs SMA20</div>
          <div style="font-weight:700;color:${pctColor(i.vsSma20)};">${pct(i.vsSma20)}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:20%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Regime</div>
          <div style="font-weight:700;">${esc(i.regime)}</div>
        </td>
        <td style="padding:8px;border:1px solid #e2e8f0;background:#f8fafc;text-align:center;width:20%;">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Score</div>
          <div style="font-weight:700;">${i.score}/100</div>
        </td>
      </tr>
    </table>

    <!-- Levels -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;font-size:12px;">
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#f8fafc;text-align:center;">
        <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Support</div>
        <div style="font-weight:700;">${money(i.support, i.currency)}</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#f8fafc;text-align:center;">
        <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Pivot</div>
        <div style="font-weight:700;">${money(i.pivot, i.currency)}</div>
      </div>
      <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#f8fafc;text-align:center;">
        <div style="color:#94a3b8;font-size:10px;text-transform:uppercase;">Resistance</div>
        <div style="font-weight:700;">${money(i.resistance, i.currency)}</div>
      </div>
    </div>

    <!-- Sparkline -->
    <div style="margin-top:12px;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;margin-bottom:4px;">Recent price path</div>
      ${miniSpark(i.history, histPositive)}
    </div>

    <!-- Reasoning -->
    <div style="margin-top:12px;font-size:12px;color:#475569;line-height:1.55;background:#f8fafc;border-radius:8px;padding:10px;border:1px solid #e2e8f0;">
      <strong style="color:#0f172a;">Engine reasoning:</strong> ${esc(i.reasoning)}
      ${i.convictionReason ? `<br/><strong style="color:#0f172a;">Conviction:</strong> ${esc(i.convictionReason)}` : ""}
    </div>

    <!-- Outlook cases -->
    ${renderOutlook(i)}
  </div>`;
}

export function renderReportHtml(report: KoinsReport): string {
  const s = report.summary;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(report.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:820px;margin:0 auto;padding:24px 16px 48px;">

    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#f8fafc;border-radius:16px;padding:28px 24px;margin-bottom:20px;">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;font-weight:600;">AetherForge Koins · Crypto Full Engine · Self-hosted</div>
      <h1 style="margin:8px 0 4px;font-size:26px;font-weight:800;letter-spacing:-0.02em;">${esc(report.title)}</h1>
      <div style="font-size:13px;color:#94a3b8;">${esc(report.generatedAt)}</div>
      <div style="margin-top:10px;font-size:12px;color:#cbd5e1;">Same technical engine that powers the AetherForge AI website (RSI, MACD, SMAs, regime, probabilistic outlook, conviction).</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px;">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Portfolio value</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;">${money(s.totalValue)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Cost basis</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;">${money(s.totalCost)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Unrealised P&amp;L</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;color:${pctColor(s.totalPnl)};">${s.totalPnl >= 0 ? "+" : ""}${money(s.totalPnl)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;">Return</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;color:${pctColor(s.totalPnlPct)};">${pct(s.totalPnlPct)}</div>
      </div>
    </div>

    <h2 style="font-size:16px;font-weight:700;margin:0 0 6px;">Holdings · full technical analysis</h2>
    <p style="font-size:13px;color:#64748b;margin:0 0 8px;">${s.holdingsCount} position${s.holdingsCount === 1 ? "" : "s"} analysed with the institutional engine.</p>

    ${report.holdings.map(holdingCard).join("")}

    <div style="margin-top:28px;padding:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.6;">
      ${esc(report.disclaimer)}
    </div>

    <div style="text-align:center;margin-top:18px;font-size:11px;color:#94a3b8;">
      © Forge Intelligence Ltd · AetherForge AI · Self-hosted Koins package (full engine)
    </div>
  </div>
</body>
</html>`;
}

export function writeReport(report: KoinsReport, outputDir = "output"): string {
  mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `koins-report-${stamp}.html`;
  const fullPath = join(outputDir, fileName);
  writeFileSync(fullPath, renderReportHtml(report), "utf-8");
  return fullPath;
}
