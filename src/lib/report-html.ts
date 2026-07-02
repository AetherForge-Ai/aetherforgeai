/**
 * Standalone HTML renderer for an ApexReport.
 *
 * The SAME markup is used two ways:
 *   1. Fed to `totalumSdk.files.createPdfFromHtml` to produce the downloadable PDF.
 *   2. Sent as the HTML body of the delivery email.
 *
 * It is a fully self-contained document with inline styles (email clients and the
 * PDF renderer don't share our Tailwind build), on a light, print-friendly theme.
 * Pure module — no imports beyond the report type.
 */

import type { ApexReport, TickerAnalysis, MomentumPoint } from "@/lib/apex";

export interface ReportAlert {
  ticker: string;
  currentPrice?: number | null;
  trimPct?: number | null;
  trimTriggerDipPct?: number | null;
  hardSellPrice?: number | null;
  takeProfitMinPct?: number | null;
  takeProfitMaxPct?: number | null;
  instructions?: string | null;
  status?: string | null;
}

const NAVY = "#0b1220";
const BLUE = "#2563eb";
const INK = "#0f172a";
const MUTE = "#64748b";
const LINE = "#e2e8f0";
const GREEN = "#059669";
const RED = "#dc2626";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Render the summary's tiny bold / italic markdown into HTML.
function rich(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function money(v: number): string {
  return "$" + (v ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v: number): string {
  return `${v > 0 ? "+" : ""}${(v ?? 0).toFixed(2)}%`;
}

function pctColor(v: number): string {
  return v > 0 ? GREEN : v < 0 ? RED : MUTE;
}

/** Inline SVG sparkline of the 12-month momentum series. */
function sparkline(series: MomentumPoint[], positive: boolean): string {
  const W = 520;
  const H = 90;
  const P = 6;
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (series.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - min) / span) * (H - P * 2);
  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  const stroke = positive ? GREEN : RED;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block">
    <path d="${area}" fill="${stroke}" opacity="0.10" />
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  </svg>`;
}

function signalBadge(signal: TickerAnalysis["signal"]): string {
  const map: Record<TickerAnalysis["signal"], string> = {
    "Strong Buy": GREEN,
    Accumulate: "#0d9488",
    Hold: "#0284c7",
    Watch: "#d97706",
    Reduce: RED,
  };
  const c = map[signal];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:${c};background:${c}1a;border:1px solid ${c}33">${esc(
    signal
  )}</span>`;
}

function tickerBlock(t: TickerAnalysis): string {
  const dp = t.price < 5 ? 4 : 2;
  const days = t.shortTerm
    .map(
      (d) => `<td style="text-align:center;padding:4px 2px;border:1px solid ${LINE};font-size:10px">
        <div style="color:${MUTE}">D${esc(d.day.replace("Day ", ""))}</div>
        <div style="color:${pctColor(d.movePct)};font-weight:600">${d.direction === "up" ? "▲" : d.direction === "down" ? "▼" : "—"}</div>
        <div style="color:${pctColor(d.movePct)}">${d.movePct > 0 ? "+" : ""}${d.movePct}%</div>
      </td>`
    )
    .join("");
  const paths = t.pathways
    .map(
      (p) => `<td style="padding:8px;border:1px solid ${LINE};vertical-align:top;width:33%">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:${MUTE}">${esc(p.name)} · ${p.probability}%</div>
        <div style="font-size:15px;font-weight:700;color:${pctColor(p.targetPct)}">${p.targetPct > 0 ? "+" : ""}${p.targetPct}%</div>
        <div style="font-size:10px;color:${MUTE};line-height:1.35;margin-top:2px">${esc(p.narrative)}</div>
      </td>`
    )
    .join("");

  return `<div style="border:1px solid ${LINE};border-radius:10px;padding:14px;margin:10px 0;background:#fff">
    <table width="100%" style="border-collapse:collapse"><tr>
      <td style="vertical-align:top">
        <span style="font-weight:700;font-size:15px;color:${INK}">${esc(t.ticker)}</span>
        &nbsp;${signalBadge(t.signal)}
        <div style="font-size:12px;color:${MUTE}">${esc(t.name)}</div>
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="font-family:monospace;font-size:14px;color:${INK}">$${t.price.toFixed(dp)}</div>
        <div style="font-size:11px;color:${pctColor(t.changePct)}">${pct(t.changePct)} today</div>
      </td>
    </tr></table>

    <div style="display:flex;justify-content:space-between;font-size:11px;color:${MUTE};margin-top:10px">
      <span>12-month continuation / momentum</span>
      <span style="color:${pctColor(t.momentum12moPct)}">${pct(t.momentum12moPct)} 12m</span>
    </div>
    ${sparkline(t.momentum, t.momentum12moPct >= 0)}

    <div style="font-size:11px;color:${MUTE};margin:8px 0 4px">7-day short-term projection</div>
    <table width="100%" style="border-collapse:collapse"><tr>${days}</tr></table>

    <div style="font-size:11px;color:${MUTE};margin:10px 0 4px">Three forward pathways</div>
    <table width="100%" style="border-collapse:collapse"><tr>${paths}</tr></table>

    <p style="font-size:11px;color:${MUTE};line-height:1.5;margin:10px 0 0">${esc(t.note)}</p>
  </div>`;
}

function alertsBlock(alerts: ReportAlert[]): string {
  if (!alerts.length) return "";
  const rows = alerts
    .map((a) => {
      const cur = typeof a.currentPrice === "number" ? `$${a.currentPrice.toFixed(a.currentPrice < 5 ? 4 : 2)}` : "—";
      const trim =
        a.trimPct || a.trimTriggerDipPct
          ? `Trim ${a.trimPct ?? "—"}% on a ${a.trimTriggerDipPct ?? "—"}% dip`
          : "—";
      const tp =
        a.takeProfitMinPct || a.takeProfitMaxPct
          ? `Take profit ${a.takeProfitMinPct ?? "—"}–${a.takeProfitMaxPct ?? "—"}%`
          : "—";
      const hard = typeof a.hardSellPrice === "number" ? `$${a.hardSellPrice.toFixed(2)}` : "—";
      const triggered =
        typeof a.currentPrice === "number" && typeof a.hardSellPrice === "number" && a.currentPrice <= a.hardSellPrice;
      return `<tr>
        <td style="padding:8px;border:1px solid ${LINE};font-weight:600">${esc(a.ticker)}</td>
        <td style="padding:8px;border:1px solid ${LINE};font-family:monospace">${cur}</td>
        <td style="padding:8px;border:1px solid ${LINE}">${esc(trim)}</td>
        <td style="padding:8px;border:1px solid ${LINE}">${esc(tp)}</td>
        <td style="padding:8px;border:1px solid ${LINE};color:${triggered ? RED : INK};font-weight:${triggered ? 700 : 400}">${hard}${triggered ? " · SELL SIGNAL" : ""}</td>
      </tr>${
        a.instructions
          ? `<tr><td colspan="5" style="padding:6px 8px;border:1px solid ${LINE};background:#f8fafc;font-size:11px;color:${MUTE}">${esc(a.instructions)}</td></tr>`
          : ""
      }`;
    })
    .join("");

  return `<h2 style="font-size:16px;color:${INK};margin:26px 0 8px">Your share-price action plan</h2>
    <table width="100%" style="border-collapse:collapse;font-size:12px">
      <tr style="background:${NAVY};color:#fff">
        <th style="padding:8px;text-align:left">Ticker</th>
        <th style="padding:8px;text-align:left">Now</th>
        <th style="padding:8px;text-align:left">Trim rule</th>
        <th style="padding:8px;text-align:left">Take profit</th>
        <th style="padding:8px;text-align:left">Hard sell-out</th>
      </tr>
      ${rows}
    </table>`;
}

export interface RenderReportOptions {
  userName?: string;
  generatedAtLabel: string;
  alerts?: ReportAlert[];
  /** True when the executive summary was rewritten by the Grok 4.3 narrative engine. */
  aiEnhanced?: boolean;
}

export function renderReportHtml(report: ApexReport, opts: RenderReportOptions): string {
  const gainers = report.topGainers.length
    ? report.topGainers
        .map(
          (g) =>
            `<li style="margin:4px 0"><strong>${esc(g.ticker)}</strong> · ${esc(g.name)} <span style="color:${GREEN};float:right">+${g.changePct}%</span></li>`
        )
        .join("")
    : `<li style="color:${MUTE}">Consolidating tape — no standout gainers this session.</li>`;

  const observations = report.keyObservations
    .map((o) => `<li style="margin:4px 0;color:${MUTE}">${esc(o)}</li>`)
    .join("");

  const news = report.newsSynthesis
    .map((n) => {
      const c = n.impact === "Bullish" ? GREEN : n.impact === "Bearish" ? RED : MUTE;
      return `<li style="margin:4px 0">${esc(n.headline)} <span style="color:${MUTE};font-size:11px">· ${esc(n.source)}</span> <span style="color:${c};float:right;font-size:11px">${esc(n.impact)}</span></li>`;
    })
    .join("");

  const portfolio = report.portfolio
    ? `<table width="100%" style="border-collapse:collapse;margin:14px 0">
        <tr>
          <td style="width:33%;padding:12px;border:1px solid ${LINE};border-radius:8px">
            <div style="font-size:11px;color:${MUTE}">Portfolio Value</div>
            <div style="font-size:18px;font-weight:700;color:${INK}">${money(report.portfolio.value)}</div>
          </td>
          <td style="width:33%;padding:12px;border:1px solid ${LINE}">
            <div style="font-size:11px;color:${MUTE}">Profit &amp; Loss</div>
            <div style="font-size:18px;font-weight:700;color:${pctColor(report.portfolio.pnl)}">${report.portfolio.pnl >= 0 ? "+" : ""}${money(report.portfolio.pnl)}</div>
          </td>
          <td style="width:33%;padding:12px;border:1px solid ${LINE}">
            <div style="font-size:11px;color:${MUTE}">Return</div>
            <div style="font-size:18px;font-weight:700;color:${pctColor(report.portfolio.pnlPct)}">${pct(report.portfolio.pnlPct)}</div>
          </td>
        </tr>
      </table>`
    : "";

  const tickers = report.tickers.map((t) => tickerBlock(t)).join("");

  return `<!doctype html><html><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(report.title)}</title></head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
    <div style="max-width:680px;margin:0 auto;background:#fff">
      <!-- Header -->
      <div style="background:${NAVY};padding:24px 28px;color:#fff">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:8px;background:${BLUE};display:inline-block;text-align:center;line-height:34px;font-weight:800">A</div>
          <span style="font-size:18px;font-weight:800;letter-spacing:.02em">AetherForge&nbsp;AI</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">Forge Intelligence Ltd · Intelligent Market Analysis</div>
      </div>

      <div style="padding:24px 28px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${BLUE}1a;color:${BLUE};font-size:12px;font-weight:600">⚡ Apex State</span>
          <span style="font-size:12px;color:${MUTE}">${esc(opts.generatedAtLabel)}</span>
        </div>

        <h1 style="font-size:22px;margin:14px 0 2px;color:${INK}">${esc(report.title)}</h1>
        <div style="font-size:13px;color:${MUTE}">${esc(report.marketLabel)}${opts.userName ? ` · Prepared for ${esc(opts.userName)}` : ""}</div>

        ${portfolio}

        <div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 6px">
          <h3 style="font-size:14px;margin:0;color:${INK}">Executive summary</h3>
          ${
            opts.aiEnhanced
              ? `<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:${BLUE}1a;color:${BLUE};font-size:11px;font-weight:600">✨ Enhanced by Grok 4.3</span>`
              : ""
          }
        </div>
        <div style="background:#f8fafc;border:1px solid ${LINE};border-radius:10px;padding:14px;margin:0 0 16px;font-size:13px;line-height:1.6;color:${INK}">
          ${rich(report.executiveSummary)}
        </div>

        <table width="100%" style="border-collapse:separate;border-spacing:0"><tr>
          <td style="width:50%;vertical-align:top;padding-right:8px">
            <h3 style="font-size:14px;margin:8px 0">Top gainers identified</h3>
            <ul style="padding-left:18px;margin:0;font-size:13px;list-style:none">${gainers}</ul>
          </td>
          <td style="width:50%;vertical-align:top;padding-left:8px">
            <h3 style="font-size:14px;margin:8px 0">Data-backed observations</h3>
            <ul style="padding-left:18px;margin:0;font-size:13px">${observations}</ul>
          </td>
        </tr></table>

        <h3 style="font-size:14px;margin:18px 0 8px">Global news synthesis</h3>
        <ul style="padding-left:18px;margin:0;font-size:13px;list-style:none">${news}</ul>

        ${alertsBlock(opts.alerts || [])}

        <h2 style="font-size:16px;color:${INK};margin:26px 0 4px">Per-${report.bot === "crypto" ? "asset" : "ticker"} intelligence (${report.tickers.length})</h2>
        ${tickers || `<p style="color:${MUTE};font-size:13px">Add holdings to your portfolio to populate this section.</p>`}

        <p style="font-size:11px;color:${MUTE};line-height:1.6;border-top:1px solid ${LINE};padding-top:14px;margin-top:22px">
          AetherForge AI delivers informational market intelligence only. Nothing here is personalised financial advice,
          a recommendation, or an offer to buy or sell any security or digital asset. Powered by SuperGrok 4.3. Always do your own research.
        </p>
      </div>

      <div style="background:${NAVY};padding:16px 28px;color:#94a3b8;font-size:11px;text-align:center">
        © Forge Intelligence Ltd · AetherForge AI · www.aetherforgeai.co.nz
      </div>
    </div>
  </body></html>`;
}
