/**
 * HTML renderer for the one-time Free-Trial "ZENITH MODE · ULTRA ADVANCED" report.
 *
 * The SAME self-contained markup is used two ways:
 *   1. Fed to `totalumSdk.files.createPdfFromHtml` to produce the downloadable PDF.
 *   2. Sent as the HTML body of the delivery email.
 *
 * Fully inline-styled (email clients + the PDF renderer don't share our Tailwind
 * build). Pure module — the only import is the shared TrialReport type, so this is
 * safe on server and never touches the network.
 */

import type {
  TrialReport,
  TrialTickerAnalysis,
  MonthPoint,
  MoverEntry,
  NewsHeadline,
  ForwardPrediction,
} from "@/lib/trial-types";

/* ------------------------------- Palette -------------------------------- */
// Deep "obsidian + electric cyan/violet" Zenith theme — distinct from the light
// AetherForge report so the trial feels like an elevated, one-time experience.
const VOID = "#070b16";
const PANEL = "#0e1526";
const PANEL2 = "#131c33";
const CYAN = "#22d3ee";
const VIOLET = "#a78bfa";
const GOLD = "#f6c667";
const INK = "#e7ecf6";
const MUTE = "#93a1bd";
const FAINT = "#5f6c88";
const LINE = "#1e2942";
const GREEN = "#34d399";
const RED = "#fb7185";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rich(text: string): string {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${INK}">$1</strong>`)
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function num(v: number, dp = 2): string {
  return (v ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function price(v: number): string {
  const dp = Math.abs(v) < 5 ? 4 : 2;
  return "$" + num(v, dp);
}

function pct(v: number): string {
  return `${v > 0 ? "+" : ""}${num(v, 2)}%`;
}

function pctColor(v: number): string {
  return v > 0 ? GREEN : v < 0 ? RED : MUTE;
}

/* --------------------------- Inline SVG chart --------------------------- */

/** A rich 12-month momentum / continuation line chart with gradient fill. */
function momentumChart(series: MonthPoint[], positive: boolean, id: string): string {
  if (!series.length) {
    return `<div style="color:${FAINT};font-size:11px;padding:14px 0">12-month history unavailable for this asset.</div>`;
  }
  const W = 560;
  const H = 120;
  const PX = 4;
  const PY = 10;
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PX + (i / (series.length - 1)) * (W - PX * 2);
  const y = (v: number) => H - PY - ((v - min) / span) * (H - PY * 2);
  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H - PY} L${x(0).toFixed(1)},${H - PY} Z`;
  const stroke = positive ? GREEN : RED;
  const dots = series
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="1.8" fill="${stroke}" />`)
    .join("");
  const labels = series
    .map((p, i) =>
      i % 2 === 0
        ? `<text x="${x(i).toFixed(1)}" y="${H - 1}" fill="${FAINT}" font-size="8" text-anchor="middle">${esc(p.label)}</text>`
        : ""
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block">
    <defs>
      <linearGradient id="g-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${stroke}" stop-opacity="0.35" />
        <stop offset="100%" stop-color="${stroke}" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#g-${id})" />
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
    ${labels}
  </svg>`;
}

/* ------------------------------- Badges --------------------------------- */

function signalBadge(signal: TrialTickerAnalysis["signal"]): string {
  const map: Record<TrialTickerAnalysis["signal"], string> = {
    "Strong Buy": GREEN,
    Accumulate: CYAN,
    Hold: VIOLET,
    Watch: GOLD,
    Reduce: RED,
  };
  const c = map[signal] || MUTE;
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.03em;color:${c};background:${c}1f;border:1px solid ${c}44">${esc(
    signal
  )}</span>`;
}

function impactColor(impact: NewsHeadline["impact"]): string {
  return impact === "Bullish" ? GREEN : impact === "Bearish" ? RED : MUTE;
}

/* ---------------------------- Movers boards ----------------------------- */

function moverRows(entries: MoverEntry[]): string {
  if (!entries.length) return `<tr><td style="padding:8px;color:${FAINT};font-size:11px">No data.</td></tr>`;
  return entries
    .map(
      (m, i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};color:${FAINT};font-size:10px;width:18px">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE}">
          ${
            m.image
              ? `<img src="${esc(m.image)}" width="14" height="14" style="vertical-align:middle;border-radius:50%;margin-right:6px" />`
              : ""
          }<strong style="color:${INK};font-size:12px">${esc(m.symbol)}</strong>
          <span style="color:${FAINT};font-size:10px"> ${esc(m.name)}</span>
        </td>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};text-align:right;font-family:monospace;color:${MUTE};font-size:11px">${price(m.price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${LINE};text-align:right;font-weight:700;color:${pctColor(m.changePct)};font-size:11px">${pct(m.changePct)}</td>
      </tr>`
    )
    .join("");
}

function moverBoard(title: string, accent: string, entries: MoverEntry[]): string {
  return `<div style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;background:${PANEL2}">
    <div style="padding:8px 12px;background:${accent}14;border-bottom:1px solid ${LINE};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${accent}">${esc(title)}</div>
    <table width="100%" style="border-collapse:collapse">${moverRows(entries)}</table>
  </div>`;
}

/* --------------------------- Predictions -------------------------------- */

function predictionRows(preds: ForwardPrediction[]): string {
  if (!preds.length) return "";
  return preds
    .map((p) => {
      const arrow = p.direction === "up" ? "▲" : p.direction === "down" ? "▼" : "—";
      const c = p.direction === "up" ? GREEN : p.direction === "down" ? RED : MUTE;
      return `<td style="padding:10px;border:1px solid ${LINE};vertical-align:top;width:50%;background:${PANEL2}">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:${MUTE}">${esc(p.horizon)} outlook · ${p.confidence}% conf</div>
        <div style="font-size:18px;font-weight:800;color:${c}">${arrow} ${p.expectedMovePct > 0 ? "+" : ""}${num(p.expectedMovePct, 2)}%</div>
        <div style="font-size:10px;color:${MUTE};line-height:1.45;margin-top:3px">${esc(p.rationale)}</div>
      </td>`;
    })
    .join("");
}

/* ---------------------------- Ticker block ------------------------------ */

function tickerBlock(t: TrialTickerAnalysis, idx: number): string {
  const holding = t.holding
    ? `<table width="100%" style="border-collapse:collapse;margin-top:10px">
        <tr>
          ${hCell("Position", `${num(t.holding.shares, t.holding.shares % 1 === 0 ? 0 : 4)} @ ${price(t.holding.avgPrice)}`)}
          ${hCell("Market value", price(t.holding.value))}
          ${hCell("Unrealised P&amp;L", `${t.holding.pnl >= 0 ? "+" : ""}${price(t.holding.pnl)}`, pctColor(t.holding.pnl))}
          ${hCell("Return", pct(t.holding.pnlPct), pctColor(t.holding.pnlPct))}
        </tr>
      </table>`
    : "";

  return `<div style="border:1px solid ${LINE};border-radius:14px;padding:16px;margin:14px 0;background:${PANEL};box-shadow:0 1px 0 ${LINE}">
    <table width="100%" style="border-collapse:collapse"><tr>
      <td style="vertical-align:top">
        ${
          t.image
            ? `<img src="${esc(t.image)}" width="26" height="26" style="vertical-align:middle;border-radius:50%;margin-right:8px" />`
            : ""
        }<span style="font-weight:800;font-size:17px;color:${INK}">${esc(t.symbol)}</span>
        &nbsp;${signalBadge(t.signal)}
        <div style="font-size:12px;color:${MUTE};margin-top:2px">${esc(t.name)} · ${t.assetClass === "crypto" ? "Digital asset" : "Equity"}</div>
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="font-family:monospace;font-size:16px;color:${INK}">${price(t.price)}</div>
        <div style="font-size:11px;color:${pctColor(t.change24h)}">${pct(t.change24h)} 24h</div>
      </td>
    </tr></table>

    <table width="100%" style="border-collapse:collapse;margin-top:12px">
      <tr>
        ${statCell("24h", t.change24h)}
        ${statCell("7 days", t.change7d)}
        ${statCell("30 days", t.change30d)}
        ${statCell("12 months", t.momentum12moPct)}
      </tr>
    </table>

    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:${MUTE};margin:14px 0 2px">
      <span style="text-transform:uppercase;letter-spacing:.04em">12-month continuation &amp; momentum${t.momentumIsLive ? "" : " · modelled"}</span>
      <span style="color:${pctColor(t.momentum12moPct)}">${pct(t.momentum12moPct)}</span>
    </div>
    ${momentumChart(t.momentum12mo, t.momentum12moPct >= 0, `${idx}`)}

    <table width="100%" style="border-collapse:collapse;margin-top:8px">
      <tr>
        ${miniCell("RSI (14)", t.rsi != null ? num(t.rsi, 0) : "—", t.rsi != null ? (t.rsi >= 70 ? RED : t.rsi <= 30 ? GREEN : INK) : MUTE)}
        ${miniCell("MACD", t.macdSignal ?? "—", t.macdSignal === "Bullish" ? GREEN : t.macdSignal === "Bearish" ? RED : MUTE)}
        ${miniCell("Momentum sentiment", `${t.sentiment}/100`, t.sentiment >= 55 ? GREEN : t.sentiment <= 40 ? RED : INK)}
      </tr>
    </table>

    <div style="font-size:11px;color:${MUTE};text-transform:uppercase;letter-spacing:.04em;margin:14px 0 4px">Fact-based next-move predictions</div>
    <table width="100%" style="border-collapse:collapse"><tr>${predictionRows(t.predictions)}</tr></table>

    ${holding}

    <p style="font-size:11px;color:${MUTE};line-height:1.55;margin:12px 0 0">${esc(t.note)}</p>
  </div>`;
}

function statCell(label: string, v: number): string {
  return `<td style="width:25%;padding:8px;border:1px solid ${LINE};text-align:center;background:${PANEL2}">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${FAINT}">${esc(label)}</div>
    <div style="font-size:14px;font-weight:800;color:${pctColor(v)}">${pct(v)}</div>
  </td>`;
}

function miniCell(label: string, value: string, color: string): string {
  return `<td style="width:33%;padding:8px;border:1px solid ${LINE};text-align:center;background:${PANEL2}">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${FAINT}">${esc(label)}</div>
    <div style="font-size:13px;font-weight:700;color:${color}">${esc(value)}</div>
  </td>`;
}

function hCell(label: string, value: string, color = INK): string {
  return `<td style="width:25%;padding:8px;border:1px solid ${LINE};text-align:center;background:${PANEL2}">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${FAINT}">${label}</div>
    <div style="font-size:13px;font-weight:700;color:${color}">${value}</div>
  </td>`;
}

/* ------------------------------- News ----------------------------------- */

function newsBlock(news: NewsHeadline[]): string {
  if (!news.length) return "";
  const rows = news
    .map((n) => {
      const c = impactColor(n.impact);
      const inner = `<div style="display:flex;justify-content:space-between;gap:10px">
          <span style="color:${INK};font-size:12px;font-weight:600;line-height:1.4">${esc(n.title)}</span>
          <span style="color:${c};font-size:10px;font-weight:700;white-space:nowrap">${esc(n.impact)}</span>
        </div>
        ${n.snippet ? `<div style="color:${MUTE};font-size:11px;line-height:1.45;margin-top:3px">${esc(n.snippet)}${n.snippet.length >= 180 ? "…" : ""}</div>` : ""}
        <div style="color:${FAINT};font-size:10px;margin-top:3px">${esc(n.source)}</div>`;
      return `<li style="margin:0;padding:11px 0;border-bottom:1px solid ${LINE};list-style:none">${
        n.url ? `<a href="${esc(n.url)}" style="text-decoration:none">${inner}</a>` : inner
      }</li>`;
    })
    .join("");
  return `<h2 style="font-size:15px;color:${INK};margin:26px 0 6px">🌐 Worldwide crypto news update</h2>
    <ul style="padding:0;margin:0">${rows}</ul>`;
}

/* -------------------------- Market predictions -------------------------- */

function marketPredictionsBlock(report: TrialReport): string {
  if (!report.predictions.length) return "";
  const cards = report.predictions
    .map(
      (p) => `<div style="border:1px solid ${LINE};border-radius:12px;padding:13px;margin:8px 0;background:${PANEL2}">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <strong style="color:${CYAN};font-size:13px">${esc(p.headline)}</strong>
          <span style="color:${MUTE};font-size:10px;white-space:nowrap">${p.confidence}% conviction</span>
        </div>
        <div style="color:${MUTE};font-size:11px;line-height:1.5;margin-top:4px">${esc(p.detail)}</div>
      </div>`
    )
    .join("");
  return `<h2 style="font-size:15px;color:${INK};margin:26px 0 6px">🔮 Fact-based predictions of next moves</h2>${cards}`;
}

/* ---------------------------- Movers section ---------------------------- */

function cryptoMoversSection(report: TrialReport): string {
  const b = report.cryptoMovers;
  if (!b) return "";
  return `<h2 style="font-size:15px;color:${INK};margin:26px 0 8px">📊 Top movers across the top 100 cryptocurrencies</h2>
    <table width="100%" style="border-collapse:separate;border-spacing:10px 0"><tr>
      <td style="width:50%;vertical-align:top">${moverBoard("Top gainers · 24h", GREEN, b.gainers24h)}</td>
      <td style="width:50%;vertical-align:top">${moverBoard("Top losers · 24h", RED, b.losers24h)}</td>
    </tr></table>
    <table width="100%" style="border-collapse:separate;border-spacing:10px 0;margin-top:10px"><tr>
      <td style="width:50%;vertical-align:top">${moverBoard("Momentum leaders · 7d", CYAN, b.gainers7d)}</td>
      <td style="width:50%;vertical-align:top">${moverBoard("Trend leaders · 30d", VIOLET, b.gainers30d)}</td>
    </tr></table>`;
}

function stockMoversSection(report: TrialReport): string {
  const b = report.stockMovers;
  if (!b) return "";
  return `<h2 style="font-size:15px;color:${INK};margin:26px 0 8px">📊 NZX + ASX market movers <span style="color:${FAINT};font-size:11px;font-weight:400">(${b.universeSize} names swept · ${b.live ? "live" : "modelled"} tape)</span></h2>
    <table width="100%" style="border-collapse:separate;border-spacing:10px 0"><tr>
      <td style="width:50%;vertical-align:top">${moverBoard("Top gainers", GREEN, b.gainers)}</td>
      <td style="width:50%;vertical-align:top">${moverBoard("Top losers", RED, b.losers)}</td>
    </tr></table>`;
}

/* ------------------------------- Portfolio ------------------------------ */

function portfolioStrip(report: TrialReport): string {
  const p = report.portfolio;
  if (!p) return "";
  return `<table width="100%" style="border-collapse:collapse;margin:14px 0">
    <tr>
      ${bigCell("Portfolio value", price(p.value))}
      ${bigCell("Cost basis", price(p.cost))}
      ${bigCell("Unrealised P&amp;L", `${p.pnl >= 0 ? "+" : ""}${price(p.pnl)}`, pctColor(p.pnl))}
      ${bigCell("Return", pct(p.pnlPct), pctColor(p.pnlPct))}
    </tr>
  </table>`;
}

function bigCell(label: string, value: string, color = INK): string {
  return `<td style="width:25%;padding:13px;border:1px solid ${LINE};text-align:center;background:${PANEL2}">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:${FAINT}">${label}</div>
    <div style="font-size:17px;font-weight:800;color:${color};margin-top:2px">${value}</div>
  </td>`;
}

/* ------------------------------- Document ------------------------------- */

export function renderTrialReportHtml(report: TrialReport, opts: { userName?: string }): string {
  const findings = report.keyFindings.length
    ? report.keyFindings.map((f) => `<li style="margin:6px 0;color:${MUTE};font-size:12px;line-height:1.5">${rich(f)}</li>`).join("")
    : "";

  const tickers = report.tickers.map((t, i) => tickerBlock(t, i)).join("");
  const accent = report.bot === "crypto" ? CYAN : VIOLET;

  return `<!doctype html><html><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(report.title)}</title></head>
  <body style="margin:0;padding:0;background:${VOID};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
    <div style="max-width:700px;margin:0 auto;background:${VOID}">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,${PANEL} 0%,${VOID} 70%);padding:26px 28px;border-bottom:1px solid ${LINE}">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,${CYAN},${VIOLET});display:inline-block;text-align:center;line-height:36px;font-weight:900;color:${VOID}">A</div>
          <div>
            <span style="font-size:18px;font-weight:900;letter-spacing:.02em;color:${INK}">AetherForge&nbsp;AI</span>
            <div style="font-size:10px;color:${FAINT};letter-spacing:.06em;text-transform:uppercase">Forge Intelligence Ltd</div>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${accent}1f;color:${accent};font-size:11px;font-weight:800;letter-spacing:.06em;border:1px solid ${accent}44">⚡ ${esc(report.mode)}</span>
          <span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${report.dataLive ? GREEN : GOLD}1f;color:${report.dataLive ? GREEN : GOLD};font-size:11px;font-weight:700;border:1px solid ${(report.dataLive ? GREEN : GOLD)}44">${report.dataLive ? "● LIVE DATA" : "◐ MODELLED"}</span>
          ${report.aiEnhanced ? `<span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${VIOLET}1f;color:${VIOLET};font-size:11px;font-weight:700;border:1px solid ${VIOLET}44">✨ Grok 4.3 analysis</span>` : ""}
        </div>
        <h1 style="font-size:24px;margin:16px 0 4px;color:${INK};line-height:1.2">${esc(report.title)}</h1>
        <div style="font-size:12px;color:${MUTE}">${esc(report.marketLabel)} · ${esc(report.scopeLabel)}</div>
        <div style="font-size:11px;color:${FAINT};margin-top:2px">${esc(report.generatedAtLabel)}${opts.userName ? ` · Prepared for ${esc(opts.userName)}` : ""}</div>
      </div>

      <div style="padding:22px 28px">
        ${portfolioStrip(report)}

        <h2 style="font-size:15px;color:${INK};margin:8px 0 6px">Executive summary</h2>
        <div style="background:${PANEL};border:1px solid ${LINE};border-radius:12px;padding:16px;font-size:13px;line-height:1.65;color:${INK}">
          ${rich(report.executiveSummary)}
        </div>

        ${findings ? `<h2 style="font-size:15px;color:${INK};margin:24px 0 6px">Key findings</h2><ul style="padding-left:18px;margin:0">${findings}</ul>` : ""}

        ${report.bot === "crypto" ? cryptoMoversSection(report) : stockMoversSection(report)}

        ${marketPredictionsBlock(report)}

        <h2 style="font-size:15px;color:${INK};margin:26px 0 6px">🎯 Your portfolio · per-${report.bot === "crypto" ? "asset" : "ticker"} deep analysis</h2>
        ${tickers}

        ${newsBlock(report.news)}

        <p style="font-size:10px;color:${FAINT};line-height:1.6;border-top:1px solid ${LINE};padding-top:14px;margin-top:26px">
          This ZENITH MODE report is a one-time complimentary intelligence briefing generated by AetherForge AI. It delivers
          informational market analysis only — nothing here is personalised financial advice, a recommendation, or an offer to
          buy or sell any security or digital asset. Predictions are model-derived from real market data and are not guarantees.
          Powered by SuperGrok 4.3. Always do your own research.
        </p>
      </div>

      <div style="background:${PANEL};padding:16px 28px;color:${FAINT};font-size:11px;text-align:center;border-top:1px solid ${LINE}">
        © Forge Intelligence Ltd · AetherForge AI · www.aetherforgeai.co.nz
      </div>
    </div>
  </body></html>`;
}
