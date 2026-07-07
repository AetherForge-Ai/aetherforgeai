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

import type {
  ApexReport,
  TickerAnalysis,
  MomentumPoint,
  MarketMoversGroup,
  ProjectionRow,
  RegionalNewsGroup,
  DirectRecommendation,
  PathwayPlan,
} from "@/lib/apex";
import type { SecurityIntel } from "@/lib/market-intel";
import type { ActionableIntelligence, PortfolioMetrics } from "@/lib/analytics";
import type { CurrencyCode } from "@/lib/currency";
import type { IntelligenceBriefing, BriefingOutlookRow } from "@/lib/briefing";

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

const CUR_SYMBOL: Record<CurrencyCode, string> = { NZD: "NZ$", AUD: "AU$", USD: "US$" };

/** Currency-aware money (e.g. "AU$1,234.50"). Sub-$5 prices show more precision. */
function moneyC(v: number, currency: CurrencyCode): string {
  const sym = CUR_SYMBOL[currency] ?? "$";
  const val = v ?? 0;
  return (
    sym +
    val.toLocaleString("en-NZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: Math.abs(val) > 0 && Math.abs(val) < 5 ? 4 : 2,
    })
  );
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

/* ---------------------- Technical-intelligence blocks ------------------- */

const SIG_COLOR: Record<SecurityIntel["signal"], string> = {
  "Strong Buy": GREEN,
  Buy: "#0d9488",
  Hold: "#0284c7",
  Reduce: "#d97706",
  Sell: RED,
};

function metricsStrip(m: PortfolioMetrics): string {
  const cell = (label: string, value: string, color = INK) =>
    `<td style="width:25%;padding:12px;border:1px solid ${LINE};text-align:center">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:${MUTE}">${esc(label)}</div>
      <div style="font-size:18px;font-weight:700;color:${color}">${esc(value)}</div>
    </td>`;
  return `<h3 style="font-size:14px;margin:18px 0 8px;color:${INK}">Portfolio risk &amp; quality metrics</h3>
    <table width="100%" style="border-collapse:collapse"><tr>
      ${cell("Ann. volatility", `${m.volatility.toFixed(1)}%`)}
      ${cell("Sharpe ratio", m.sharpe.toFixed(2))}
      ${cell("Health score", `${m.healthScore}/100 · ${m.healthLabel}`, m.healthScore >= 55 ? GREEN : m.healthScore >= 38 ? INK : RED)}
      ${cell("7-day alpha", pct(m.alphaPotentialPct), pctColor(m.alphaPotentialPct))}
    </tr></table>`;
}

function technicalsTable(techs: SecurityIntel[]): string {
  if (!techs.length) return "";
  const rows = techs
    .map((t) => {
      const dp = t.price < 5 ? 4 : 2;
      const sc = SIG_COLOR[t.signal];
      return `<tr>
        <td style="padding:7px;border:1px solid ${LINE};font-weight:600">${esc(t.ticker)}</td>
        <td style="padding:7px;border:1px solid ${LINE};font-family:monospace">$${t.price.toFixed(dp)}</td>
        <td style="padding:7px;border:1px solid ${LINE};color:${t.rsi >= 70 ? RED : t.rsi <= 30 ? GREEN : INK}">${t.rsi.toFixed(0)}</td>
        <td style="padding:7px;border:1px solid ${LINE};color:${t.macdSignal === "Bullish" ? GREEN : t.macdSignal === "Bearish" ? RED : MUTE}">${esc(t.macdSignal)}</td>
        <td style="padding:7px;border:1px solid ${LINE}">${t.bbPosition.toFixed(0)}%</td>
        <td style="padding:7px;border:1px solid ${LINE};color:${pctColor(t.vsSma20)}">${pct(t.vsSma20)}</td>
        <td style="padding:7px;border:1px solid ${LINE};color:${pctColor(t.projected7dPct)};font-weight:600">${pct(t.projected7dPct)} <span style="color:${MUTE};font-weight:400">(${t.confidence}%)</span></td>
        <td style="padding:7px;border:1px solid ${LINE}"><span style="color:${sc};font-weight:600">${esc(t.signal)}</span></td>
      </tr>`;
    })
    .join("");
  return `<h2 style="font-size:16px;color:${INK};margin:26px 0 8px">Technical indicators &amp; 7-day projection</h2>
    <table width="100%" style="border-collapse:collapse;font-size:11px">
      <tr style="background:${NAVY};color:#fff">
        <th style="padding:7px;text-align:left">Ticker</th>
        <th style="padding:7px;text-align:left">Price</th>
        <th style="padding:7px;text-align:left">RSI</th>
        <th style="padding:7px;text-align:left">MACD</th>
        <th style="padding:7px;text-align:left">BB%</th>
        <th style="padding:7px;text-align:left">vs SMA20</th>
        <th style="padding:7px;text-align:left">7d proj (conf)</th>
        <th style="padding:7px;text-align:left">Signal</th>
      </tr>
      ${rows}
    </table>`;
}

/* ------------------- Advanced multi-timeframe sweep blocks -------------- */

/** Top-10 movers per exchange, across the 24h / 7d / 1-month windows. */
function marketMoversBlock(groups: MarketMoversGroup[]): string {
  if (!groups.length) return "";
  const groupHtml = groups
    .map((g) => {
      const cols = g.windows
        .map((w) => {
          const rows = w.movers
            .map(
              (m, i) => `<tr>
                <td style="padding:4px 6px;border-bottom:1px solid ${LINE};font-size:11px">
                  <span style="color:${MUTE};font-size:10px">${i + 1}.</span>
                  <strong style="color:${INK}">${esc(m.ticker)}</strong>
                </td>
                <td style="padding:4px 6px;border-bottom:1px solid ${LINE};text-align:right;font-size:11px;color:${pctColor(m.changePct)};font-weight:600">${pct(m.changePct)}</td>
              </tr>`
            )
            .join("");
          return `<td style="vertical-align:top;width:33%;padding:0 6px">
            <div style="font-size:11px;font-weight:700;color:${BLUE};margin:0 0 4px">${esc(w.window)}</div>
            <table width="100%" style="border-collapse:collapse">${rows || `<tr><td style="font-size:11px;color:${MUTE}">—</td></tr>`}</table>
          </td>`;
        })
        .join("");
      return `<div style="margin:10px 0 4px">
        <div style="font-size:13px;font-weight:700;color:${INK};margin:0 0 6px">${esc(g.label)}</div>
        <table width="100%" style="border-collapse:separate;border-spacing:0"><tr>${cols}</tr></table>
      </div>`;
    })
    .join("");
  return `<h2 style="font-size:16px;color:${INK};margin:26px 0 4px">Full multi-timeframe mover sweep · Top 10</h2>
    <div style="font-size:12px;color:${MUTE};margin:0 0 4px">Biggest share-price gainers across each exchange over the last 24 hours, 7 days and month.</div>
    ${groupHtml}`;
}

/** The top-10 highest-conviction 7-day forward projections. */
function projectionLeadersBlock(rows: ProjectionRow[]): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r, i) => `<tr>
        <td style="padding:6px 7px;border:1px solid ${LINE};font-size:11px"><span style="color:${MUTE}">${i + 1}.</span> <strong>${esc(r.ticker)}</strong> <span style="color:${MUTE}">· ${esc(r.name)}</span></td>
        <td style="padding:6px 7px;border:1px solid ${LINE};font-size:11px;text-align:center">${esc(r.market)}</td>
        <td style="padding:6px 7px;border:1px solid ${LINE};font-family:monospace;font-size:11px;text-align:right">${moneyC(r.price, r.currency)}</td>
        <td style="padding:6px 7px;border:1px solid ${LINE};font-size:12px;text-align:right;color:${pctColor(r.projected7dPct)};font-weight:700">${pct(r.projected7dPct)}</td>
        <td style="padding:6px 7px;border:1px solid ${LINE};font-size:11px;text-align:right;color:${MUTE}">${r.confidence}%</td>
      </tr>`
    )
    .join("");
  return `<h2 style="font-size:16px;color:${INK};margin:26px 0 8px">Next 7 days · Top-10 projected movers</h2>
    <table width="100%" style="border-collapse:collapse">
      <tr style="background:${NAVY};color:#fff;font-size:11px">
        <th style="padding:6px 7px;text-align:left">Security</th>
        <th style="padding:6px 7px;text-align:center">Market</th>
        <th style="padding:6px 7px;text-align:right">Price</th>
        <th style="padding:6px 7px;text-align:right">7-day proj.</th>
        <th style="padding:6px 7px;text-align:right">Conf.</th>
      </tr>
      ${body}
    </table>`;
}

/** News broadcasts / press releases grouped by region (NZ, AU, US, Global). */
function regionalNewsBlock(groups: RegionalNewsGroup[]): string {
  if (!groups.length) return "";
  const blocks = groups
    .map((g) => {
      const items = g.items
        .map((n) => {
          const c = n.impact === "Bullish" ? GREEN : n.impact === "Bearish" ? RED : MUTE;
          return `<li style="margin:4px 0;font-size:12px">${esc(n.headline)}
            <span style="color:${MUTE};font-size:11px">· ${esc(n.source)} · ${esc(n.time)}</span>
            <span style="color:${c};float:right;font-size:11px;font-weight:600">${esc(n.impact)}</span></li>`;
        })
        .join("");
      return `<div style="margin:8px 0">
        <h3 style="font-size:13px;margin:6px 0 2px;color:${INK}">${esc(g.region)}</h3>
        <ul style="padding-left:18px;margin:0;list-style:none">${items}</ul>
      </div>`;
    })
    .join("");
  return `<h2 style="font-size:16px;color:${INK};margin:26px 0 4px">News &amp; press-release watch · NZ · AU · US</h2>
    ${blocks}`;
}

const ACTION_COLOR: Record<DirectRecommendation["action"], string> = {
  SELL: RED,
  TRIM: "#d97706",
  HOLD: "#0284c7",
  BUY: "#0d9488",
  ACCUMULATE: GREEN,
};

/** Direct, plain-English buy/sell/hold instructions on specific securities. */
function directRecommendationsBlock(recs: DirectRecommendation[]): string {
  if (!recs.length) return "";
  const row = (r: DirectRecommendation) => {
    const c = ACTION_COLOR[r.action];
    return `<li style="margin:8px 0;font-size:12px;line-height:1.5">
      <span style="display:inline-block;min-width:78px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;color:${c};background:${c}1a;border:1px solid ${c}44;text-align:center">${esc(r.action)}</span>
      <strong style="color:${INK}">&nbsp;${esc(r.ticker)}</strong>
      <span style="color:${MUTE}">· ${moneyC(r.price, r.currency)}</span>
      <div style="color:${INK};margin-top:2px">${esc(r.detail)}</div>
    </li>`;
  };
  const held = recs.filter((r) => r.held);
  const fresh = recs.filter((r) => !r.held);
  const urgent = held.some((r) => r.action === "SELL" || r.action === "TRIM");
  const banner = urgent
    ? `<div style="background:${RED}12;border:1px solid ${RED}55;border-radius:8px;padding:10px 14px;margin:6px 0 12px">
        <strong style="color:${RED}">⚠ Action required</strong>
        <span style="color:${INK};font-size:12px"> — one or more holdings are projected to weaken. Direct exit/trim guidance below.</span>
      </div>`
    : "";
  return `<h2 style="font-size:16px;color:${INK};margin:26px 0 8px">Direct recommendations — build &amp; protect wealth</h2>
    ${banner}
    ${held.length ? `<h3 style="font-size:13px;margin:6px 0;color:${INK}">On your holdings</h3><ul style="padding-left:2px;margin:0;list-style:none">${held.map(row).join("")}</ul>` : ""}
    ${fresh.length ? `<h3 style="font-size:13px;margin:14px 0 6px;color:${GREEN}">New high-conviction opportunities (not yet held)</h3><ul style="padding-left:2px;margin:0;list-style:none">${fresh.map(row).join("")}</ul>` : ""}`;
}

/** Three forward pathways with steps + the single recommended route. */
function pathwayPlanBlock(plan: PathwayPlan): string {
  if (!plan.pathways.length) return "";
  const cols = plan.pathways
    .map((p) => {
      const rec = p.recommended;
      return `<td style="padding:12px;border:2px solid ${rec ? BLUE : LINE};border-radius:8px;vertical-align:top;width:33%;background:${rec ? BLUE + "0a" : "#fff"}">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:${MUTE}">${esc(p.risk)} · ${p.probability}% odds</div>
        <div style="font-weight:700;font-size:14px;color:${INK}">${esc(p.name)}${rec ? ` <span style="color:${BLUE};font-size:10px;font-weight:700">★ RECOMMENDED</span>` : ""}</div>
        <div style="font-size:16px;font-weight:700;color:${pctColor(p.targetPct)}">${pct(p.targetPct)} <span style="font-size:10px;color:${MUTE};font-weight:400">7-day target</span></div>
        <div style="font-size:11px;color:${MUTE};margin:4px 0 6px;line-height:1.4">${esc(p.summary)}</div>
        <ol style="padding-left:16px;margin:0;font-size:11px;color:${INK};line-height:1.5">
          ${p.steps.map((s) => `<li style="margin:3px 0">${esc(s)}</li>`).join("")}
        </ol>
      </td>`;
    })
    .join("");
  return `<h2 style="font-size:16px;color:${INK};margin:26px 0 8px">Three pathways forward — with step-by-step plan</h2>
    <div style="background:${BLUE}0f;border:1px solid ${BLUE}44;border-radius:8px;padding:12px 14px;margin:0 0 12px">
      <strong style="color:${BLUE}">★ Recommended route: ${esc(plan.recommendedName)}</strong>
      <div style="color:${INK};font-size:12px;line-height:1.5;margin-top:3px">${esc(plan.recommendationNote)}</div>
    </div>
    <table width="100%" style="border-collapse:separate;border-spacing:6px 0"><tr>${cols}</tr></table>`;
}

/* ----------------------- 7-Day Intelligence Briefing -------------------- */

function convColor(level: string): string {
  return level === "High" ? GREEN : level === "Moderate" ? BLUE : level === "Speculative" ? RED : MUTE;
}
function biasColor(bias: string): string {
  return bias === "Constructive" ? GREEN : bias === "Defensive" ? RED : MUTE;
}
function sgn(x: number): string {
  return `${x >= 0 ? "+" : ""}${x}%`;
}

function outlookRow(r: BriefingOutlookRow): string {
  const { base, bull, bear } = r.outlook;
  const cell = (label: string, lo: number, hi: number, prob: number, color: string) =>
    `<td style="padding:7px 8px;border-top:1px solid ${LINE};text-align:center">
       <div style="font-size:12px;color:${color};font-weight:700">${sgn(lo)} … ${sgn(hi)}</div>
       <div style="font-size:10px;color:${MUTE}">${label} · ${prob}%</div>
     </td>`;
  return `<tr>
    <td style="padding:7px 8px;border-top:1px solid ${LINE}">
      <div style="font-weight:700;color:${INK};font-size:12px">${esc(r.ticker)}</div>
      <div style="font-size:10px;color:${MUTE}">${esc(r.regime)} · <span style="color:${convColor(r.conviction)}">${esc(r.conviction)} conv.</span></div>
    </td>
    ${cell("Bear", bear.lowPct, bear.highPct, bear.probability, RED)}
    ${cell("Base", base.lowPct, base.highPct, base.probability, INK)}
    ${cell("Bull", bull.lowPct, bull.highPct, bull.probability, GREEN)}
  </tr>`;
}

function briefingBlock(b: IntelligenceBriefing): string {
  const obs = b.keyObservations.map((o) => `<li style="margin:4px 0;color:${MUTE}">${esc(o)}</li>`).join("");
  const risks = b.risks.map((r) => `<li style="margin:4px 0;color:${MUTE}">${esc(r)}</li>`).join("");
  const catalysts = b.catalysts.length
    ? b.catalysts
        .map((e) => {
          const c = e.importance === "High" ? RED : BLUE;
          return `<li style="margin:5px 0">
            <span style="display:inline-block;min-width:74px;color:${MUTE};font-size:11px">${esc(e.dateLabel)}</span>
            <strong style="color:${INK}">${esc(e.title)}</strong>
            <span style="color:${c};font-size:11px"> · ${esc(e.region)} · ${esc(e.importance)}</span>
            <div style="font-size:11px;color:${MUTE};margin:1px 0 0 74px">${esc(e.note)}</div>
          </li>`;
        })
        .join("")
    : `<li style="color:${MUTE};font-size:12px">No top-tier scheduled macro events in the next 7 days.</li>`;
  const highlights = b.highlights.length
    ? b.highlights.map((h) => `<li style="margin:4px 0;color:${INK}">${rich(h)}</li>`).join("")
    : "";
  const rows = b.outlook.map((r) => outlookRow(r)).join("");

  return `
  <div style="margin:22px 0 6px;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
    <div style="background:${NAVY};padding:12px 16px;color:#fff;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:15px;font-weight:800">🎯 7-Day Intelligence Briefing</span>
      <span style="font-size:11px;color:#cbd5e1">Probabilistic · evidence-based</span>
    </div>
    <div style="padding:14px 16px">
      <!-- Overall conviction -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${biasColor(b.overall.bias)}1a;color:${biasColor(b.overall.bias)};font-size:12px;font-weight:700">${esc(b.overall.bias)} bias</span>
        <span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${convColor(b.overall.level)}1a;color:${convColor(b.overall.level)};font-size:12px;font-weight:700">${esc(b.overall.level)} conviction</span>
        <span style="display:inline-block;padding:4px 11px;border-radius:999px;background:#f1f5f9;color:${INK};font-size:12px;font-weight:700">Net ${b.overall.score}/100</span>
        <span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${b.sentiment.label === "Bullish" ? GREEN : b.sentiment.label === "Bearish" ? RED : MUTE}1a;color:${b.sentiment.label === "Bullish" ? GREEN : b.sentiment.label === "Bearish" ? RED : MUTE};font-size:12px;font-weight:700">Sentiment ${esc(b.sentiment.label)} ${b.sentiment.score}/100</span>
      </div>
      <div style="font-size:12px;color:${MUTE};margin:-4px 0 14px">${esc(b.overall.reason)}</div>

      ${highlights ? `<h3 style="font-size:13px;margin:12px 0 6px;color:${INK}">Highlights</h3><ul style="padding-left:18px;margin:0;font-size:12px;list-style:none">${highlights}</ul>` : ""}

      <h3 style="font-size:13px;margin:16px 0 6px;color:${INK}">Key observations</h3>
      <ul style="padding-left:18px;margin:0;font-size:12px">${obs}</ul>

      <h3 style="font-size:13px;margin:16px 0 6px;color:${INK}">Catalysts — next 7 days</h3>
      <ul style="padding-left:6px;margin:0;list-style:none;font-size:12px">${catalysts}</ul>

      <h3 style="font-size:13px;margin:16px 0 6px;color:${INK}">Risks — next 7 days</h3>
      <ul style="padding-left:18px;margin:0;font-size:12px">${risks}</ul>

      <h3 style="font-size:13px;margin:16px 0 6px;color:${INK}">Probabilistic 7-day outlook</h3>
      <div style="font-size:11px;color:${MUTE};margin-bottom:6px">Expected % move over the next 7 sessions per ticker — volatility-scaled ranges, not point targets.</div>
      <table width="100%" style="border-collapse:collapse;font-size:12px">
        <tr style="background:#f8fafc">
          <td style="padding:6px 8px;font-size:10px;color:${MUTE};text-transform:uppercase;letter-spacing:.04em">Ticker</td>
          <td style="padding:6px 8px;font-size:10px;color:${MUTE};text-align:center">Bear</td>
          <td style="padding:6px 8px;font-size:10px;color:${MUTE};text-align:center">Base</td>
          <td style="padding:6px 8px;font-size:10px;color:${MUTE};text-align:center">Bull</td>
        </tr>
        ${rows || `<tr><td colspan="4" style="padding:8px;color:${MUTE}">Add holdings to populate the outlook.</td></tr>`}
      </table>

      <div style="font-size:10px;color:${MUTE};line-height:1.6;margin-top:12px;border-top:1px solid ${LINE};padding-top:10px">${esc(b.disclaimer)}</div>
    </div>
  </div>`;
}

export interface RenderReportOptions {
  userName?: string;
  generatedAtLabel: string;
  alerts?: ReportAlert[];
  /** True when the executive summary was rewritten by the ZENITH State narrative engine. */
  aiEnhanced?: boolean;
  /** AI engine label, e.g. "SuperGrok 4.3 · Ultra Advanced ZENITH State". */
  engine?: string;
  /** Per-holding technical intelligence (RSI/MACD/BB/SMA + projection + signal). */
  technicals?: SecurityIntel[];
  /** Explicit SELL/BUY signals + forward pathways derived from holdings. */
  intelligence?: ActionableIntelligence;
  /** Portfolio risk/quality metrics. */
  metrics?: PortfolioMetrics;
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
            <div style="font-size:11px;color:${MUTE}">Total Worth · ${esc(report.portfolio.currency)}</div>
            <div style="font-size:18px;font-weight:700;color:${INK}">${moneyC(report.portfolio.value, report.portfolio.currency)}</div>
          </td>
          <td style="width:33%;padding:12px;border:1px solid ${LINE}">
            <div style="font-size:11px;color:${MUTE}">Profit &amp; Loss</div>
            <div style="font-size:18px;font-weight:700;color:${pctColor(report.portfolio.pnl)}">${report.portfolio.pnl >= 0 ? "+" : ""}${moneyC(report.portfolio.pnl, report.portfolio.currency)}</div>
          </td>
          <td style="width:33%;padding:12px;border:1px solid ${LINE}">
            <div style="font-size:11px;color:${MUTE}">Return</div>
            <div style="font-size:18px;font-weight:700;color:${pctColor(report.portfolio.pnlPct)}">${pct(report.portfolio.pnlPct)}</div>
          </td>
        </tr>
      </table>
      ${
        report.portfolio.currency === "NZD"
          ? `<div style="font-size:11px;color:${MUTE};margin:-6px 0 8px">Total worth is aggregated in NZD — Australian (.AX) holdings are shown in AUD and US holdings in USD on their individual cards, then converted to NZD here.</div>`
          : ""
      }`
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
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${BLUE}1a;color:${BLUE};font-size:12px;font-weight:600">⚡ ${esc(opts.engine || report.engine || "Ultra Advanced ZENITH State")}</span>
          <span style="font-size:12px;color:${MUTE}">${esc(opts.generatedAtLabel)}</span>
        </div>

        <h1 style="font-size:22px;margin:14px 0 2px;color:${INK}">${esc(report.title)}</h1>
        <div style="font-size:13px;color:${MUTE}">${esc(report.marketLabel)}${opts.userName ? ` · Prepared for ${esc(opts.userName)}` : ""}</div>

        ${portfolio}

        ${opts.metrics ? metricsStrip(opts.metrics) : ""}

        <div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 6px">
          <h3 style="font-size:14px;margin:0;color:${INK}">Executive summary</h3>
          ${
            opts.aiEnhanced
              ? `<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:${BLUE}1a;color:${BLUE};font-size:11px;font-weight:600">✨ Authored in ZENITH State · SuperGrok 4.3</span>`
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

        ${report.briefing ? briefingBlock(report.briefing) : ""}

        ${marketMoversBlock(report.marketMovers)}

        ${projectionLeadersBlock(report.projectionLeaders)}

        ${
          report.regionalNews && report.regionalNews.length
            ? regionalNewsBlock(report.regionalNews)
            : `<h3 style="font-size:14px;margin:18px 0 8px">Global news synthesis</h3>
               <ul style="padding-left:18px;margin:0;font-size:13px;list-style:none">${news}</ul>`
        }

        ${directRecommendationsBlock(report.directRecommendations)}

        ${pathwayPlanBlock(report.pathwayPlan)}

        ${alertsBlock(opts.alerts || [])}

        ${opts.technicals ? technicalsTable(opts.technicals) : ""}

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
