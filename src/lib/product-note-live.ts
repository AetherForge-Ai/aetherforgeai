import "server-only";

import { totalumSdk } from "@/lib/totalum";
import { sendTransactionalEmail } from "@/lib/send-transactional-mail";
import { createGrokChatCompletion, isZenithConfigured } from "@/lib/grok";
import { CRYPTO_UNIVERSE, entriesForExchange, type Exchange } from "@/lib/market-intel";
import { yahooCryptoSymbol, yahooEquitySymbol } from "@/lib/yahoo-finance";
import { reportEmailWasDelivered } from "@/lib/report-email";
import {
  assembleProductNote,
  nzsxBoardUrl,
  parseOfficialCashRate,
  parseRssItems,
  productNoteSendingEnabled,
  PRODUCT_NOTE_FROM,
  renderProductNote,
  scenarioFacts,
  dedupeRecipients,
  type IndexBar,
  type MarketFacts,
  type NoteMarket,
  type OutboundProductNote,
  type PricePoint,
  type ProductNoteKind,
  type RawHeadline,
  type RenderedProductNote,
  type SymbolSeries,
  type VerifiedFacts,
} from "@/lib/product-note";

/**
 * Live figures for a product note. Prices come from the same Yahoo quotes the
 * site already uses. Directory seed prices are never copied into a note.
 * This module does not send mail unless deliverProductNote is called, and that
 * function refuses unless PRODUCT_NOTE_SEND is exactly "on".
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";
const OCR_URL =
  "https://www.rbnz.govt.nz/monetary-policy/about-monetary-policy/the-official-cash-rate";
const NEWS_FEEDS = [
  "https://www.rnz.co.nz/rss/business.xml",
  "https://feeds.bbci.co.uk/news/business/rss.xml",
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
];

function positive(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function zoned(epochSec: number, timeZone: string): { date: string; minutes: number } | null {
  if (!Number.isFinite(epochSec)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochSec * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  if (!get("year") || !get("month") || !get("day")) return null;
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

async function fetchText(url: string): Promise<{ ok: boolean; text: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, text: "" };
    return { ok: true, text: await res.text() };
  } catch (err) {
    console.error("[product-notes] fetch failed:", err);
    return { ok: false, text: "" };
  }
}

function indexBarsFromChart(json: unknown): IndexBar[] {
  const result = (json as { chart?: { result?: { timestamp?: unknown[]; indicators?: { quote?: { open?: unknown[]; close?: unknown[] }[] } }[] } })
    ?.chart?.result?.[0];
  const ts = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  const opens = quote?.open || [];
  const closes = quote?.close || [];
  const bars: IndexBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const z = zoned(Number(ts[i]), "Pacific/Auckland");
    if (!z) continue;
    bars.push({ date: z.date, minutes: z.minutes, open: positive(opens[i]), close: positive(closes[i]) });
  }
  return bars;
}

async function loadIndex(): Promise<{ fetched: boolean; bars: IndexBar[] }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent("^NZ50")}?range=1mo&interval=1d`;
  const res = await fetchText(url);
  if (!res.ok || !res.text) return { fetched: false, bars: [] };
  try {
    return { fetched: true, bars: indexBarsFromChart(JSON.parse(res.text)) };
  } catch {
    return { fetched: false, bars: [] };
  }
}

function sparkNodes(json: unknown): Record<string, { timestamp?: unknown[]; close?: unknown[] }> {
  const body = json as {
    spark?: { result?: { symbol?: string; response?: { timestamp?: unknown[]; indicators?: { quote?: { close?: unknown[] }[] } }[] }[] };
  };
  const by: Record<string, { timestamp?: unknown[]; close?: unknown[] }> = {};
  if (Array.isArray(body?.spark?.result)) {
    for (const row of body.spark.result) {
      const resp = row?.response?.[0];
      if (!row?.symbol) continue;
      by[row.symbol] = { timestamp: resp?.timestamp, close: resp?.indicators?.quote?.[0]?.close };
    }
    return by;
  }
  if (json && typeof json === "object") {
    for (const [symbol, node] of Object.entries(json as Record<string, { timestamp?: unknown[]; close?: unknown[] }>)) {
      by[symbol] = node;
    }
  }
  return by;
}

function pointsFromNode(node: { timestamp?: unknown[]; close?: unknown[] } | undefined, timeZone: string): PricePoint[] {
  const ts = node?.timestamp || [];
  const closes = node?.close || [];
  const byDate = new Map<string, number>();
  for (let i = 0; i < ts.length; i++) {
    const z = zoned(Number(ts[i]), timeZone);
    const close = positive(closes[i]);
    if (!z || close == null) continue;
    byDate.set(z.date, close);
  }
  return [...byDate.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchSpark(symbols: string[], timeZone: string): Promise<Record<string, PricePoint[]>> {
  const out: Record<string, PricePoint[]> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++];
      const url = `https://query1.finance.yahoo.com/v8/finance/spark?range=3mo&interval=1d&symbols=${encodeURIComponent(chunk.join(","))}`;
      const res = await fetchText(url);
      if (!res.ok || !res.text) continue;
      try {
        const nodes = sparkNodes(JSON.parse(res.text));
        for (const symbol of chunk) out[symbol] = pointsFromNode(nodes[symbol], timeZone);
      } catch (err) {
        console.error("[product-notes] spark parse failed:", err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, () => worker()));
  return out;
}

async function loadMarkets(): Promise<MarketFacts[]> {
  const specs: { market: NoteMarket; zone: string; entries: { ticker: string; name: string }[]; yahoo: (t: string) => string }[] = [
    { market: "NZSX", zone: "Pacific/Auckland", entries: entriesForExchange("NZX" as Exchange), yahoo: yahooEquitySymbol },
    { market: "ASX", zone: "Australia/Sydney", entries: entriesForExchange("ASX" as Exchange), yahoo: yahooEquitySymbol },
    { market: "Nasdaq", zone: "America/New_York", entries: entriesForExchange("NASDAQ" as Exchange), yahoo: yahooEquitySymbol },
    { market: "Dow Jones", zone: "America/New_York", entries: entriesForExchange("DOW" as Exchange), yahoo: yahooEquitySymbol },
    { market: "Crypto", zone: "UTC", entries: CRYPTO_UNIVERSE, yahoo: yahooCryptoSymbol },
  ];
  const loaded = await Promise.all(
    specs.map(async (spec): Promise<MarketFacts> => {
      const yahooSymbols = spec.entries.map((e) => spec.yahoo(e.ticker));
      let points: Record<string, PricePoint[]> = {};
      try {
        points = await fetchSpark(yahooSymbols, spec.zone);
      } catch (err) {
        console.error(`[product-notes] ${spec.market} history failed:`, err);
      }
      const series: SymbolSeries[] = [];
      spec.entries.forEach((entry, i) => {
        const row = points[yahooSymbols[i]];
        if (!row?.length) return;
        series.push({ ticker: entry.ticker, name: entry.name, points: row });
      });
      return { market: spec.market, requested: spec.entries.length, series };
    })
  );
  return loaded;
}

async function loadHeadlines(): Promise<RawHeadline[]> {
  const pages = await Promise.all(NEWS_FEEDS.map((url) => fetchText(url)));
  const out: RawHeadline[] = [];
  for (const page of pages) {
    if (!page.ok || !page.text) continue;
    for (const item of parseRssItems(page.text)) {
      out.push({ headline: item.title, url: item.link, publishedAt: item.publishedAt });
    }
  }
  return out;
}

async function loadOcr(): Promise<number | null> {
  const page = await fetchText(OCR_URL);
  if (!page.ok || !page.text) return null;
  return parseOfficialCashRate(page.text);
}

async function loadScenario(facts: string): Promise<string | null> {
  if (!isZenithConfigured()) return null;
  try {
    return await createGrokChatCompletion({
      maxTokens: 180,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are the AetherForge AI. Write at most two short sentences for a product email. " +
            "Describe an illustration of the figures below. Do not say what happens next. " +
            "Do not tell the reader to take an action. Never name a model vendor, a model product, or a version. " +
            "Do not mention a win rate. Do not mention interest rates. " +
            "Use only the figures below. If a figure is missing, leave it out. No formulas.",
        },
        { role: "user", content: facts },
      ],
    });
  } catch (err) {
    console.error("[product-notes] AI scenario unavailable:", err);
    return null;
  }
}

export async function loadVerifiedFacts(): Promise<VerifiedFacts> {
  const [index, markets, headlines, verifiedOcr] = await Promise.all([
    loadIndex(),
    loadMarkets(),
    loadHeadlines(),
    loadOcr(),
  ]);
  return {
    indexFetched: index.fetched,
    indexBars: index.bars,
    markets,
    headlines,
    verifiedOcr,
    scenarioText: null,
    boardUrl: nzsxBoardUrl(process.env.NEXT_PUBLIC_APP_URL),
  };
}

export async function buildLiveProductNote(kind: ProductNoteKind, now: Date): Promise<RenderedProductNote> {
  const facts = await loadVerifiedFacts();
  const draft = assembleProductNote(kind, now, facts);
  const sheet = scenarioFacts(draft);
  const scenarioText = sheet ? await loadScenario(sheet) : null;
  return renderProductNote(assembleProductNote(kind, now, { ...facts, scenarioText }));
}

export async function loadRegisteredRecipients(): Promise<{ email: string }[]> {
  const pageSize = 1000;
  const rows: { email?: unknown }[] = [];
  for (let page = 0; page < 20; page++) {
    const res = await totalumSdk.crud.query("user", { _limit: pageSize, _offset: page * pageSize });
    const batch = ((res as { data?: { email?: unknown }[] })?.data || []) as { email?: unknown }[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return dedupeRecipients(rows);
}

/**
 * Hands one note to the existing mail sender.
 * Refuses unless the switch is on, so a direct call cannot send by accident.
 * The SDK documents fromName and replyTo. `from` is also posted so the admin
 * mailbox is requested; the platform type list does not include that field.
 * `text` is the plain part. The note already renders one.
 */
export async function deliverProductNote(message: OutboundProductNote): Promise<void> {
  if (!productNoteSendingEnabled()) {
    throw new Error("Product note sender is off.");
  }
  if (message.from !== PRODUCT_NOTE_FROM || message.replyTo !== PRODUCT_NOTE_FROM) {
    throw new Error("Product note from address is not the admin mailbox.");
  }
  const result = await sendTransactionalEmail({
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    fromName: message.fromName,
    replyTo: message.replyTo,
    from: message.from,
  });
  if (!reportEmailWasDelivered(result)) {
    throw new Error("Product note was not accepted by the mail sender.");
  }
}
