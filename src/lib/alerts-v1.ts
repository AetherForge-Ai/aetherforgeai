/**
 * Goal b17 G-04: Alerts v1 — price level, % move, holding news, ex-dividend date.
 * In app only (no email: K-05 parked), behind IN_APP_ALERTS_V1=1.
 *
 * `evaluateAlerts` is pure: given the member's rules and a feed snapshot it returns
 * the alerts that fire, each with its source and time. A rule that is switched off
 * (unsubscribed) never fires. Wording is descriptive only.
 */
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";

export type AlertKind = "price_level" | "pct_move" | "holding_news" | "ex_dividend";

export interface AlertRule {
  id: string;
  kind: AlertKind;
  ticker: string;
  /** price_level: level in the quote currency; pct_move: absolute % (e.g. 5); ex_dividend: days ahead. */
  threshold?: number;
  direction?: "above" | "below";
  active: boolean;
}

export interface FeedQuote {
  ticker: string;
  price: number;
  previousClose: number | null;
  currency: string;
  source: string;
  quotedAt: string;
}

export interface FeedNews {
  headline: string;
  tickers: string[];
  source: string;
  publishedAt: string;
  url?: string;
}

export interface FeedDividend {
  ticker: string;
  exDate: string;
  amount: number | null;
  currency: string;
  source: string;
  announcedAt: string;
}

export interface AlertFeed {
  quotes: FeedQuote[];
  news: FeedNews[];
  dividends: FeedDividend[];
}

export interface FiredAlert {
  ruleId: string;
  kind: AlertKind;
  ticker: string;
  message: string;
  source: string;
  /** Time of the data that triggered it (ISO). */
  at: string;
  atLabel: string;
}

const ADVICE = /\b(buy|sell|hold|accumulate|trim|should|recommend|opportunity|act now)\b/i;

const money = (n: number, ccy: string) => `${ccy === "NZD" ? "NZ$" : ccy === "AUD" ? "AU$" : ccy === "USD" ? "US$" : `${ccy} `}${n.toFixed(2)}`;

export function evaluateAlerts(rules: readonly AlertRule[], feed: AlertFeed, now = Date.now()): FiredAlert[] {
  const out: FiredAlert[] = [];
  const fire = (rule: AlertRule, message: string, source: string, at: string) =>
    out.push({ ruleId: rule.id, kind: rule.kind, ticker: rule.ticker, message, source, at, atLabel: formatDisplayDateTime(at) });
  for (const rule of rules) {
    if (!rule.active) continue;
    const t = rule.ticker.toUpperCase();
    if (rule.kind === "price_level" || rule.kind === "pct_move") {
      const q = feed.quotes.find((x) => x.ticker.toUpperCase() === t);
      if (!q || !(q.price > 0)) continue;
      if (rule.kind === "price_level" && rule.threshold != null) {
        const crossed = rule.direction === "below" ? q.price <= rule.threshold : q.price >= rule.threshold;
        if (crossed) fire(rule, `${t} is at ${money(q.price, q.currency)}, ${rule.direction === "below" ? "at or below" : "at or above"} your level of ${money(rule.threshold, q.currency)}.`, q.source, q.quotedAt);
      }
      if (rule.kind === "pct_move" && rule.threshold != null && q.previousClose && q.previousClose > 0) {
        const move = (q.price / q.previousClose - 1) * 100;
        if (Math.abs(move) >= rule.threshold) fire(rule, `${t} has moved ${move >= 0 ? "+" : "−"}${Math.abs(move).toFixed(2)}% since the previous close (your trigger is ${rule.threshold}%).`, q.source, q.quotedAt);
      }
    }
    if (rule.kind === "holding_news") {
      const n = feed.news.find((x) => x.tickers.map((s) => s.toUpperCase()).includes(t));
      if (n) fire(rule, `News mentioning ${t}: “${n.headline}”.`, n.source, n.publishedAt);
    }
    if (rule.kind === "ex_dividend") {
      const ahead = rule.threshold ?? 7;
      const d = feed.dividends.find((x) => x.ticker.toUpperCase() === t);
      if (d) {
        const days = Math.round((Date.parse(`${d.exDate}T00:00:00Z`) - now) / 86_400_000);
        if (days >= 0 && days <= ahead) {
          const amt = d.amount != null ? ` (${money(d.amount, d.currency)} per share)` : "";
          fire(rule, `${t} goes ex-dividend on ${formatDisplayDate(d.exDate)}${amt}.`, d.source, d.announcedAt);
        }
      }
    }
  }
  return out;
}

export function adviceWording(alerts: readonly FiredAlert[]): string[] {
  return alerts.map((a) => a.message.replace(/“[^”]*”/g, "")).filter((m) => ADVICE.test(m));
}

export const ALERT_RULES_KEY = "aetherforge-alert-rules-v1";
export function alertsV1Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.IN_APP_ALERTS_V1 === "1";
}
