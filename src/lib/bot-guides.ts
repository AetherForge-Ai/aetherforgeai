/**
 * Public bot pages. Figures in the example are synthetic and labelled Example.
 * pull-check:batch2-2026-10-11 B2-10
 */

import { BOT_COUNT_LINE, FREE_REPORTS_LINE, PAPER_BOOK_STATEMENT, SMITTY_ROLE_LINE } from "@/lib/public-copy";

/** One short note, rendered once by BotGuide. Not repeated inside each bot's own copy. */
export const BOT_PAGE_DISCLAIMER = [
  PAPER_BOOK_STATEMENT,
  "A report is general information, not advice, and it is not a recommendation to buy or sell.",
  "Share prices are delayed public market data. They are not a direct NZX or ASX feed.",
  "Crypto prices are delayed or indicative. Crypto projections stay paused.",
  "A missing price, date or exchange rate is left blank.",
  BOT_COUNT_LINE,
  FREE_REPORTS_LINE,
].join(" ");

const STOX = [
  "Stox is the share-market bot. It reads the shares you enter on the paper book and writes a plain-English note about those names.",
  "The markets it covers in the product are NZX, ASX and US shares. A ticker ending in .NZ is treated as a New Zealand listing. A ticker ending in .AX is treated as an Australian listing. Other share tickers are treated as overseas names for the working papers.",
  "Stox does not place a trade, does not hold client money, and does not connect to a broker login.",
  "What a Stox note can talk about is the quote used for that note, the ticker, and the question you typed. If you leave the question blank, the request still includes a short default question. The request does not include a card number.",
  "Use Stox when the book is shares. If the book is only coins, Koins is the matching bot. Free and Starter include one of the two, not both. Pro includes both.",
].join(" ");

const KOINS = [
  "Koins is the crypto bot. It reads the coins you enter on the paper book and writes a plain-English note about those coins.",
  "Crypto quotes are delayed or indicative. The page shows an as-of time when it has one. Koins does not place a trade and does not connect to an exchange login.",
  "Crypto projections stay paused. A Koins note is not a projection and it is not a signal to buy or sell.",
  "Free and Starter include one of Stox or Koins. Pro includes both, and the Headmaster can read the latest Stox and Koins findings when that book is available.",
].join(" ");

const SMITTY = [
  SMITTY_ROLE_LINE,
  "Smitty sits next to the three AI bots. Smitty is not a fourth AI bot and does not write a research report.",
  "Gold and silver spot prices come from gold-api.com. They are shown in NZ$ when the daily foreign-exchange rate is available. Smitty does not place a trade.",
  "Free includes read-only Smitty spot prices. Paid plans can record metal holdings in the paper book. Those holdings are ounces you type. Smitty does not move metal.",
].join(" ");

const HEADMASTER = [
  "The Headmaster is the planning bot. It looks across the paper book you have entered: shares, coins and cash, when those rows exist.",
  "Starter includes a basic Headmaster. Pro and Ultimate include the full planner. A signed-out visitor sees this explanation and the example book. The member console stays behind sign-in.",
  "The Headmaster chat can send the totals, the cash weight, the allocation and the top positions already on the book. It can send a plan you typed. It does not send a card number. It does not place a trade.",
  "Stress figures and scenario pathways, when the member console shows them, are illustrations from the book you entered. They are general information, not advice.",
].join(" ");

export const BOT_GUIDES = {
  stox: STOX,
  koins: KOINS,
  smitty: SMITTY,
  headmaster: HEADMASTER,
} as const;

export function guideWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
