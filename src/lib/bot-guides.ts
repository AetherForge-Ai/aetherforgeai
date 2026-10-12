/**
 * Public bot pages. Figures in the example are synthetic and labelled Example.
 * pull-check:batch2-2026-10-11 B2-10
 */

import { BOT_COUNT_LINE, FREE_REPORTS_LINE, PAPER_BOOK_STATEMENT, SMITTY_ROLE_LINE } from "@/lib/public-copy";

const METHOD = [
  PAPER_BOOK_STATEMENT,
  "A report is general information, not advice. It does not consider your circumstances, and it is not a recommendation to buy or sell.",
  "You keep the assets at your own broker or exchange. Recording a buy in AetherForge does not send an order. A sell in the paper book does not pay you.",
  "Share prices for NZX-listed and ASX-listed names, and for US shares, come from public market data (Yahoo Finance). They are delayed. They are not a direct NZX or ASX feed.",
  "Crypto prices are delayed or indicative. Crypto projections on the projections page stay paused.",
  "Gold and silver spot prices come from gold-api.com. Foreign-exchange rates are a daily rate. A missing rate is not guessed.",
  BOT_COUNT_LINE,
  FREE_REPORTS_LINE,
  "Published prices are NZ$0, NZ$16, NZ$49 and NZ$199 a month. All prices in NZD.",
  "Free can track 10 holdings and run 3 reports in a month, and chooses one of Stox or Koins. Starter can track 25 holdings and chooses one of Stox or Koins. Pro can track 75 holdings and includes Stox and Koins. Ultimate does not cap holdings.",
  "The plain-English note is written by a third-party AI service. The calculated figures come from a rules-based engine. The page does not name the model.",
  "A stored member report for Stox, Koins or Headmaster marks its summary as not AI-enhanced when that summary is built from the calculated figures.",
  "History shown for projections is about 30 days. Stock charts are about six months. Those lengths are what the product stores. They are not a promise of older history.",
  "The example book on this page is not a member book. It has no live price, no profit figure, and no customer. Every row is marked Example.",
  "Limits that matter: the paper book can be wrong if a price, a date or an exchange rate was missing when you saved the row. The page leaves a missing rate blank. It does not fill a gap with a guessed number.",
  "Email support is available on every plan, including Free. The addresses are admin@aetherforgeai.co.nz and lukas@aetherforgeai.co.nz.",
  "A signed-out visitor can read this page and the example book. Nothing on the example book is saved, and nothing on it is a customer holding.",
  "If a feed does not answer, the price is left off. The last saved print is labelled with its time when the product has one. A quiet feed is not described as current.",
  "Read the AI disclaimer before you act. The member console for the Headmaster is available after sign-in. This public page does not show a member book, a balance, or a holding that belongs to a person. The example rows use the names EXAMPLE.NZ and EXAMPLE-COIN so they cannot be confused with a listed company or a coin on a public feed.",
].join(" ");

const STOX = [
  "Stox is the share-market bot. It reads the shares you enter on the paper book and writes a plain-English note about those names.",
  "The markets it covers in the product are NZX, ASX and US shares. A ticker ending in .NZ is treated as a New Zealand listing. A ticker ending in .AX is treated as an Australian listing. Other share tickers are treated as overseas names for the working papers.",
  "Stox does not place a trade, does not hold client money, and does not connect to a broker login.",
  "What a Stox note can talk about is the quote used for that note, the ticker, and the question you typed. If you leave the question blank, the request still includes a short default question. The request does not include a card number.",
  "Use Stox when the book is shares. If the book is only coins, Koins is the matching bot. Free and Starter include one of the two, not both. Pro includes both.",
  METHOD,
].join(" ");

const KOINS = [
  "Koins is the crypto bot. It reads the coins you enter on the paper book and writes a plain-English note about those coins.",
  "Crypto quotes are delayed or indicative. The page shows an as-of time when it has one. Koins does not place a trade and does not connect to an exchange login.",
  "Crypto projections stay paused. A Koins note is not a projection and it is not a signal to buy or sell.",
  "Free and Starter include one of Stox or Koins. Pro includes both, and the Headmaster can read the latest Stox and Koins findings when that book is available.",
  METHOD,
].join(" ");

const SMITTY = [
  SMITTY_ROLE_LINE,
  "Smitty sits next to the three AI bots. Smitty is not a fourth AI bot and does not write a research report.",
  "Gold and silver spot prices come from gold-api.com. They are shown in NZ$ when the daily foreign-exchange rate is available. Smitty does not place a trade.",
  "Free includes read-only Smitty spot prices. Paid plans can record metal holdings in the paper book. Those holdings are ounces you type. Smitty does not move metal.",
  METHOD,
].join(" ");

const HEADMASTER = [
  "The Headmaster is the planning bot. It looks across the paper book you have entered: shares, coins and cash, when those rows exist.",
  "Starter includes a basic Headmaster. Pro and Ultimate include the full planner. A signed-out visitor sees this explanation and the example book. The member console stays behind sign-in.",
  "The Headmaster chat can send the totals, the cash weight, the allocation and the top positions already on the book. It can send a plan you typed. It does not send a card number. It does not place a trade.",
  "Stress figures and scenario pathways, when the member console shows them, are illustrations from the book you entered. They are general information, not advice.",
  METHOD,
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
