/**
 * Public bot pages. Figures in the example are synthetic and labelled Example.
 * pull-check:batch2-2026-10-11 B2-10
 */

import { POSITIONING_LINE, SMITTY_ROLE_LINE } from "@/lib/public-copy";

/**
 * b5 M-3: the shared positioning paragraph lives once, on /how-it-works (PAPER_BOOK_STATEMENT).
 * Each bot page shows only the one-line positioning (BL-5) plus its own note below,
 * so no two bot pages carry the same boilerplate paragraph.
 */
export const BOT_PAGE_POSITIONING = POSITIONING_LINE;

/** Distinct per-bot notes: what each bot's data is, and what it never does. */
export const BOT_PAGE_NOTES: Record<"stox" | "koins" | "smitty" | "headmaster", string> = {
  stox: "Stox works from delayed share prices (about 20 minutes on the NZX while the market is open), not a direct NZX or ASX feed. If a share has no recent print, Stox says the data is too old rather than giving a score. Each Stox note is general information about the shares you entered, not a recommendation.",
  koins: "Koins works from delayed or indicative coin prices and shows the as-of time it used. A coin whose price is under review is flagged, and crypto projections stay paused. A Koins note describes the coins you entered; it is not a forecast or a signal to trade.",
  smitty: "Smitty is a price view, not an AI bot: it shows gold and silver spot prices beside the ounces you typed, converted to NZ$ when the day's exchange rate is available. A missing rate is left blank rather than guessed.",
  headmaster: "The Headmaster only reads what is already on your book. Goal ranges and stress figures are illustrations from those numbers, labelled as such, and never a forecast or personal advice.",
};

/** @deprecated kept for older imports; equals the one-line positioning, not the old paragraph. */
export const BOT_PAGE_DISCLAIMER = BOT_PAGE_POSITIONING;

const STOX_PARAS = [
  "Stox is the share-market bot. It reads the shares you enter on the paper book and writes a plain-English note about those names.",
  "The markets it covers in the product are NZX, ASX and US shares. A ticker ending in .NZ is treated as a New Zealand listing. A ticker ending in .AX is treated as an Australian listing. Other share tickers are treated as overseas names for the working papers.",
  "Stox does not place a trade, does not hold client money, and does not connect to a broker login.",
  "What a Stox note can talk about is the quote used for that note, the ticker, and the question you typed. If you leave the question blank, the request still includes a short default question. The request does not include a card number.",
  "Use Stox when the book is shares. If the book is only coins, Koins is the matching bot. Free and Starter include one of the two, not both. Pro includes both.",
  "How a note is put together. When you ask Stox about a holding, the app first looks up the latest delayed quote it has for that ticker, along with the time of that quote and the source it came from. It then adds the details already on your paper book for that line: the number of shares you entered, your average cost in the listing currency, and the NZ$ value at the day's exchange rate when that rate is available. Your question, or the short default question, goes in last. The note that comes back is written in plain English and shows the as-of time of the price it used.",
  "What a note will not do. Stox does not tell you to buy, sell or hold. It does not give a price target. It does not rank your holdings against each other as a recommendation, and it does not claim to know what a share will do next. If the quote for a share is too old, Stox says so and does not write a score from it. If a figure it needs is missing, the page shows a dash with a reason rather than a guess.",
  "Prices and their limits. NZX and ASX prices in the app are delayed public prices, not a direct exchange feed. Each price on the tape carries a small coloured dot. Green means the last refresh returned a quote. Amber means one refresh was missed and the previous print is still on screen. Red means two refreshes in a row were missed, or there is no usable print. Hover over the dot to see the source, the delay and the as-of time.",
  "Working with your book. Shares are added as entries on the paper book: a buy, a sell, a dividend, or an opening balance. A share split can be recorded from the holdings toolbar, and the app restates earlier lots so the share count and NZ$ cost stay consistent. Dividends can include imputation credits, withholding tax and dividend reinvestment shares, and those reinvested shares join the holding count. All of this is the information Stox can read when it writes a note.",
  "Reports and plans. Stox notes count towards the research report allowance on your plan: 3 a month on Free, 15 a month on Starter, and no monthly cap on Pro and Ultimate. Holdings are capped at 10 on Free, 25 on Starter and 75 on Pro, and Ultimate has no holdings cap. Prices are NZ$0, NZ$16, NZ$49 and NZ$199 a month. The meter on the dashboard shows how much of your cap is used, for example 12 of 25 used.",
  "Who it suits. Stox suits someone who keeps a record of NZ, Australian or US shares and wants a plain description of what is on the book, written from the numbers they entered. It is a record-keeping and information tool. It is not a broker, and it is not a substitute for advice from a financial adviser.",
];
const STOX = STOX_PARAS.join(" ");

const KOINS_PARAS = [
  "Koins is the crypto bot. It reads the coins you enter on the paper book and writes a plain-English note about those coins.",
  "Crypto quotes are delayed or indicative. The page shows an as-of time when it has one. Koins does not place a trade and does not connect to an exchange login.",
  "Crypto projections stay paused. A Koins note is not a projection and it is not a signal to buy or sell.",
  "The Headmaster can read the latest Koins findings when that book is available.",
  "How a note is put together. When you ask Koins about a coin, the app looks up the latest indicative price it has for that coin, the time of that price, and the venue or service it came from. It adds what is already on your paper book for that coin: the quantity you entered, your average cost, and the NZ$ value when the day's exchange rate is available. Your question, or a short default question, goes in last. The note that comes back is plain English and shows the as-of time it used.",
  "Where the prices come from. Coin prices are gathered from public crypto price services, such as a crypto exchange's public price list and CoinGecko. They are indicative, not a quote you could trade at. When one service does not return a price, the app tries the next one. When none returns a usable price, the coin shows a dash with a reason rather than an invented number. A coin whose price is under review is flagged on the page.",
  "What a note will not do. Koins does not tell you to buy, sell or hold a coin. It does not forecast where a price will go, and crypto projections stay paused across the product. It does not connect to an exchange account, does not ask for a wallet key, and does not move coins. Everything Koins reads is the information you typed into the paper book plus the public price it looked up.",
  "Working with your book. Coins are recorded as entries on the paper book in the same way as shares: a buy, a sell, or an opening balance, with fees if you paid them. Cash movements sit beside them, so the book shows how much NZ$ cash is left after each entry. Broker and exchange CSV files can be imported, and the import checks for a file that was already imported so the same rows are not added twice.",
  "Reports and plans. Koins notes count towards the research report allowance on your plan: 3 a month on Free, 15 a month on Starter, and no monthly cap on Pro and Ultimate. Free and Starter include one of Stox or Koins. Pro and Ultimate include both. Holdings are capped at 10 on Free, 25 on Starter and 75 on Pro, and Ultimate has no holdings cap. Prices are NZ$0, NZ$16, NZ$49 and NZ$199 a month.",
  "Who it suits. Koins suits someone who keeps a record of the crypto they hold and wants a plain description of it in NZ$, with the source and time of every price shown. Crypto prices can move sharply, and an indicative price can differ from what an exchange would pay. Koins is an information tool, not a trading service and not financial advice.",
];
const KOINS = KOINS_PARAS.join(" ");

const SMITTY_PARAS = [
  SMITTY_ROLE_LINE,
  "Smitty sits next to the three AI bots and is not one of them.",
  "Gold and silver spot prices come from gold-api.com. They are shown in NZ$ when the daily foreign-exchange rate is available. Smitty does not place a trade.",
  "Free includes read-only Smitty spot prices. Paid plans can record metal holdings in the paper book. Those holdings are ounces you type. Smitty does not move metal.",
  "What the page shows. For gold and silver, Smitty shows the latest spot price per troy ounce, the time of that price, and the source. When the day's exchange rate is available, the price is also shown in NZ$. If you have recorded metal on your paper book, a Held row shows the ounces you entered, so you can see your quantity next to the spot price. If the exchange rate is missing, the NZ$ figure is left blank with a reason rather than estimated.",
  "Where the prices come from. Spot prices come from the public gold-api.com service. A spot price is a reference price for a standard ounce. It is not what a dealer will pay you or charge you, and coins, bars and jewellery usually trade above or below spot. The page shows the time of the last price it used, so you can see how fresh it is.",
  "Recording metal. On a paid plan you can add gold and silver to the paper book as ounces, with the price you paid. Those ounces are a record you keep. Smitty does not buy, store, insure or deliver metal, and it does not check that the metal exists. You can record dividends and cash beside your metal in the same book, so your overall split between shares, crypto, metal and cash stays in one place.",
  "Price alerts. Members on Starter and above can set price alerts on the metals page. An alert shows in the app when it triggers. Alerts are not emailed, and an alert is a notice about a figure you asked to watch, not a recommendation.",
  "Ounces and units. Prices are quoted per troy ounce, which is about 31.1 grams, not the ounce used for food. If you record metal bought in grams or kilograms, convert it to troy ounces first so the Held row and the NZ$ value line up with the spot price. Silver usually has a much lower price per ounce than gold and can move by a larger percentage in a day, so the two metals are shown on separate lines rather than added together.",
  "Plans. Free includes the read-only spot prices. Starter, Pro and Ultimate let you record metal holdings and set alerts. Prices are NZ$0, NZ$16, NZ$49 and NZ$199 a month. Smitty does not use the research report allowance, because it does not write reports.",
  "Who it suits. Smitty suits someone who owns physical gold or silver, or follows the metals, and wants a simple view of spot prices in NZ$ beside the ounces they hold. It is a price view and a record, not a dealer and not financial advice.",
];
const SMITTY = SMITTY_PARAS.join(" ");

const HEADMASTER_PARAS = [
  "The Headmaster is the planning bot. It looks across the paper book you have entered: shares, coins and cash, when those rows exist.",
  "A signed-out visitor sees this explanation and the example book. The member console stays behind sign-in.",
  "The Headmaster chat can send the totals, the cash weight, the allocation and the top positions already on the book. It can send a plan you typed. It does not send a card number. It does not place a trade.",
  "Stress figures and scenario pathways, when the member console shows them, are illustrations from the book you entered. They are general information, not advice.",
  "What it reads. The Headmaster works from the paper book you have entered: each share, coin and metal line, your cash, and the entries behind them. From those it can describe how the book is split between shares, crypto, metal and cash, which positions are largest. It can also read the latest Stox and Koins findings for the same book when your plan includes them.",
  "Plans and goals. You can type a plan in your own words, such as a target cash weight or a limit on any single holding. The Headmaster compares the book with what you wrote and describes the gap in plain English. It does not tell you what to buy or sell to close that gap. Where the console shows a goal range or a stress figure, it is an illustration worked out from the numbers on the book, and it is labelled as an illustration.",
  "What it will not do. The Headmaster does not place a trade, connect to a broker, or move money. It does not give personal financial advice, and it does not forecast returns. When a figure it needs is missing, such as a price that did not load or an exchange rate that is not available, the console shows a dash with a reason rather than filling the gap.",
  "The tax side of the book. Alongside the planner, the book keeps the records a New Zealand investor usually needs at tax time: dividends with imputation credits and withholding tax, realised gains worked out first in, first out, and foreign investment fund working papers. These are working papers to take to your accountant, not a filed return. Share splits and dividend reinvestment shares are carried through so the lots line up.",
  "Plans. Starter includes a basic Headmaster. Pro and Ultimate include the full planner. Prices are NZ$0, NZ$16, NZ$49 and NZ$199 a month. Holdings are capped at 10 on Free, 25 on Starter and 75 on Pro, and Ultimate has no holdings cap. A signed-out visitor sees this page and the example book below. The example rows are synthetic and show no market value or profit.",
  "Who it suits. The Headmaster suits someone who keeps their shares, crypto, metal and cash in one record and wants a plain description of the whole book against a plan they wrote themselves. It is an information and record-keeping tool, not a financial adviser.",
];
const HEADMASTER = HEADMASTER_PARAS.join(" ");

/** Paragraphs as written, so each page reads as short paragraphs rather than one line per sentence. */
export const BOT_GUIDE_PARAGRAPHS = {
  stox: STOX_PARAS,
  koins: KOINS_PARAS,
  smitty: SMITTY_PARAS,
  headmaster: HEADMASTER_PARAS,
} as const;

export type BotGuideKind = keyof typeof BOT_GUIDE_PARAGRAPHS;

/** Synthetic example rows for each bot page. Stox shows a share, Koins a coin, Smitty a metal. */
export const BOT_EXAMPLES: Record<BotGuideKind, { rows: { name: string; quantity: string; note: string }[]; report: string }> = {
  stox: {
    rows: [{ name: "EXAMPLE.NZ", quantity: "10 shares", note: "Example only" }],
    report:
      "Example Stox note. This is not a member result. The note says a paper row of 10 EXAMPLE.NZ shares is on the book and describes the latest delayed quote. It does not say whether to buy or sell.",
  },
  koins: {
    rows: [{ name: "EXAMPLE-COIN", quantity: "1 coin", note: "Example only" }],
    report:
      "Example Koins note. This is not a member result. The note says one EXAMPLE-COIN is on the book and gives the indicative price and its as-of time. It is not a projection or a signal.",
  },
  smitty: {
    rows: [{ name: "Gold (example)", quantity: "1 oz", note: "Example only" }],
    report:
      "Example Smitty view. This is not a member result. It shows the ounces typed into the book next to the latest gold spot price in NZ$. Smitty does not write a report.",
  },
  headmaster: {
    rows: [
      { name: "EXAMPLE.NZ", quantity: "10 shares", note: "Example only" },
      { name: "EXAMPLE-COIN", quantity: "1 coin", note: "Example only" },
      { name: "Cash", quantity: "NZ$1,000.00", note: "Example only" },
    ],
    report:
      "Example Headmaster overview. This is not a member result. It describes how the example book is split between shares, crypto and cash. It does not tell you to rebalance.",
  },
};

export const BOT_GUIDES = {
  stox: STOX,
  koins: KOINS,
  smitty: SMITTY,
  headmaster: HEADMASTER,
} as const;

export function guideWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
