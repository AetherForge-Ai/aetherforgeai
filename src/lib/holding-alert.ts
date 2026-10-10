/**
 * Holding notices. The message is composed here and is not sent.
 * Quiet hours and unsubscribe are decided in this module.
 *
 * pull-check:batch2-2026-10-11 B2-8
 */

export type WatchKind = "price_level" | "percent_move" | "news" | "ex_dividend";

export interface WatchAlert {
  id: string;
  ticker: string;
  kind: WatchKind;
  status: "active" | "paused";
  /** Price level in the quote currency. */
  level?: number | null;
  /** above or below the level. */
  side?: "above" | "below";
  /** Absolute percent move that fires the notice. */
  movePct?: number | null;
  /** User-entered ex-dividend civil date, YYYY-MM-DD. */
  exDate?: string | null;
  /** Headline supplied with the refresh. Not fetched here. */
  headline?: string | null;
}

export interface WatchQuote {
  price: number | null;
  changePct: number | null;
  source: string;
  asOf: string;
}

export interface WatchNotice {
  sent: false;
  id: string;
  ticker: string;
  kind: WatchKind;
  subject: string;
  text: string;
  source: string;
  time: string;
  quiet: boolean;
  unsubscribed: boolean;
}

const QUIET_START_MINUTES = 22 * 60;
const QUIET_END_MINUTES = 7 * 60;

export function inQuietHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const minutes = hour * 60 + minute;
  return minutes >= QUIET_START_MINUTES || minutes < QUIET_END_MINUTES;
}

export function applyUnsubscribe(alerts: readonly WatchAlert[], id: string): WatchAlert[] {
  return alerts.map((alert) => (alert.id === id ? { ...alert, status: "paused" } : alert));
}

function fired(alert: WatchAlert, quote: WatchQuote, today: string): boolean {
  if (alert.status !== "active") return false;
  if (alert.kind === "price_level") {
    if (quote.price == null || alert.level == null) return false;
    return alert.side === "below" ? quote.price <= alert.level : quote.price >= alert.level;
  }
  if (alert.kind === "percent_move") {
    if (quote.changePct == null || alert.movePct == null) return false;
    return Math.abs(quote.changePct) >= alert.movePct;
  }
  if (alert.kind === "news") return Boolean(alert.headline && alert.headline.trim());
  if (alert.kind === "ex_dividend") return Boolean(alert.exDate && today >= alert.exDate);
  return false;
}

function detail(alert: WatchAlert, quote: WatchQuote): string {
  if (alert.kind === "price_level") return `${alert.ticker} price is ${quote.price} against the level ${alert.level} you entered.`;
  if (alert.kind === "percent_move") return `${alert.ticker} moved ${quote.changePct}% against the ${alert.movePct}% level you entered.`;
  if (alert.kind === "news") return `${alert.ticker} headline: ${alert.headline}`;
  return `${alert.ticker} ex-dividend date you entered is ${alert.exDate}.`;
}

/** Compose notices for alerts that fired. Nothing is delivered. */
export function composeWatchNotices(input: {
  alerts: readonly WatchAlert[];
  quotes: Readonly<Record<string, WatchQuote>>;
  now: Date;
  today: string;
}): WatchNotice[] {
  const quiet = inQuietHours(input.now);
  const notices: WatchNotice[] = [];
  for (const alert of input.alerts) {
    const quote = input.quotes[alert.ticker.toUpperCase()];
    if (!quote || !fired(alert, quote, input.today)) continue;
    const text = [
      detail(alert, quote),
      `Source: ${quote.source}`,
      `Time: ${quote.asOf}`,
      "This notice is about a figure you asked to watch. It is not a recommendation to buy or sell.",
      "Unsubscribe: open Alerts and pause this watch.",
      quiet ? "Quiet hours: 22:00–07:00 Pacific/Auckland. This notice was held." : "Quiet hours: 22:00–07:00 Pacific/Auckland.",
    ].join("\n");
    notices.push({
      sent: false,
      id: alert.id,
      ticker: alert.ticker.toUpperCase(),
      kind: alert.kind,
      subject: `${alert.ticker.toUpperCase()} watch`,
      text,
      source: quote.source,
      time: quote.asOf,
      quiet,
      unsubscribed: false,
    });
  }
  return notices;
}
