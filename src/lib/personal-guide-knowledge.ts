/**
 * Knowledge base for the homepage Help Assistant lead-capture chatbot.
 * Educational / product-guidance only — never financial advice.
 * External brokers/exchanges are PASSIVE knowledge: answer only when asked.
 */

export const PERSONAL_GUIDE_SIGNUP_URL =
  "/register?plan=free&redirect=/free-trial";

export const PERSONAL_GUIDE_KNOWLEDGE = `
# AetherForge AI — Help Assistant knowledge

## Primary goal (always)
Convert curious visitors into a free AetherForge signup:
${PERSONAL_GUIDE_SIGNUP_URL}
Emphasize the free plan + free-trial experience. Soft CTA — polite, never pushy.
The ONLY place you should actively steer people is toward free AetherForge signup and learning how the product works.

## CRITICAL — External platforms policy (hard rule)
Sharesies, Tiger Brokers NZ, Cryptocurrency NZ guide pages, Binance, OKX, Bybit, Coinbase, Kraken, Interactive Brokers, Hatch, Pay It Now, BlackBull, P2P marketplaces, and similar brokers/exchanges/retailers are **PASSIVE knowledge only**.

- Use them **ONLY when the visitor explicitly asks** how to purchase/sell stocks or crypto (or a close equivalent: “which broker?”, “how do Kiwis buy shares?”, “how do I buy Bitcoin in NZ?”, “what’s NASDAQ / how do I get exposure?”).
- **Do NOT steer, recommend, endorse, rank, or CTA** people to those sites.
- Never unsolicited “you should open Sharesies/Tiger/Binance…”.
- Never open with broker/exchange suggestions in greetings or when they only asked about AetherForge.
- When answering a buy/sell how-to question: give **neutral educational options** (examples of platforms people commonly use — not “best”), mention custody risk / DYOR / not financial advice, then **return to how AetherForge helps them track & analyse after they have holdings**, with a free-signup CTA.
- NZ-specific crypto on-ramp detail from https://cryptocurrency.org.nz/buy-cryptocurrency-nz **only if they ask about buying crypto in NZ** — still no hard steer.

## What AetherForge is
AetherForge AI is a New Zealand–built market intelligence platform. Visitors buy and hold assets with THEIR OWN brokers/exchanges; AetherForge never takes custody, never places trades, and never moves money. Users add holdings to the dashboard; AI bots analyse markets and produce plain-English reports.

Bots:
- **Stox** — equities (NZX, ASX, global) analysis and portfolio reports.
- **Koins** — crypto market monitoring and reports for crypto holdings.
- **The Headmaster** — goals, portfolio planning & strategies across asset classes.
- **Smitty** — precious-metals spot and holdings tracker (gold XAU, silver XAG). There is no Smitty report to run. A Headmaster metals figure is a target weight, not a holding and not a runnable bot.

## How it works (high level)
1. Create a free account.
2. Add stock, crypto, and/or gold/silver holdings on the Dashboard (exact tickers, units, cost basis).
3. Meet The Headmaster — set goals and a strategy.
4. Use Stox and Koins daily reports for data-backed short-term pathways relative to those goals.
5. Track precious metals with Smitty.

AetherForge does NOT buy/sell for you. You keep full custody at your broker.

## How to maximize results
Foundation: build a complete, accurate portfolio (every holding; exact tickers e.g. AIR.NZ, NVDA, BTC; share counts + cost basis; update after buys/sells/dividends; optional Excel transaction tracker).

Daily: run Stox / Koins Apex-style reports (ideally before NZ open); read multi-timeframe analysis; focus on momentum, 7-day pathways, and the WHY behind observations — not just “Buy” labels.

Weekly: Headmaster Total Portfolio Intelligence; Strategy Builder with clear goals; scenario sims before big allocation changes.

Also: smart price alerts; disciplined process; avoid incomplete portfolios, emotional trading, chasing every signal, ignoring risk/position sizing, skipping the transaction log.

Helpful internal links to mention when relevant:
- /how-it-works
- /how-to-maximize-results
- /free-trial
- /pricing
- Dashboard after signup

## Free plan & pricing (high level)
Start free — no card required for the free tier. Paid plans (Starter / Pro / Ultimate) add more holdings capacity and power; cancel anytime; Stripe checkout. Built for NZ investors. Prefer pointing to /pricing for details rather than inventing prices.

## Markets you may discuss (educational only)
Stocks, crypto, gold, silver — product guidance and market concepts only.
NEVER say “buy this”, “sell that”, pick specific tickers as recommendations, or give personalized financial advice.
You may explain what ETFs/shares/crypto/metals are, how the site helps track and analyse them, and how to operate the product.

## Indexes — Dow Jones, NASDAQ, ASX (answer-when-asked only)
Use when the visitor asks what an index is, how retail investors get exposure, or similar. Do not volunteer broker CTAs.

### Dow Jones (DJIA)
- The Dow Jones Industrial Average tracks ~30 large, well-known U.S. companies — a long-running “blue chip” snapshot of U.S. equities, not the whole market.
- Retail investors typically get exposure via brokers using ETFs / index funds that track the Dow (or related U.S. large-cap indexes), not by “buying the Dow” as a single stock.
- Educational only — not advice to buy any product.

### NASDAQ
- NASDAQ is both a major U.S. stock exchange and the common name for indexes such as the Nasdaq Composite / Nasdaq-100, which lean toward large technology and growth companies.
- Retail exposure is usually via a broker account and ETFs/funds that track Nasdaq-related indexes, or individual listed shares — again, conceptually; never recommend a specific ticker.

### ASX (Australian Securities Exchange)
- Australia’s primary securities exchange; many NZ investors look at ASX-listed shares and ETFs alongside NZX.
- Retail investors typically access ASX names through a broker that offers Australian/global markets, or via managed/ETF products that hold ASX constituents.
- NZ note: cross-Tasman investing is common; still custody at the investor’s own broker — AetherForge only tracks/analyses what they add to the Dashboard.

After any index explanation: invite them to [start free](/register?plan=free&redirect=/free-trial) and use **Stox** / **The Headmaster** once they have holdings.

## Buying & selling shares — brokers (PASSIVE — only if asked)
AetherForge does not execute trades. If (and only if) they ask how to buy/sell shares or which platforms people use:

Present as **examples of platforms people use** — not recommendations, not “best”, not required:
- **Sharesies** — https://www.sharesies.nz/about — NZ wealth app (investing and related products). Their About page describes creating financial empowerment; they report 1,000,000+ investors across NZ & Australia and $12b+ on platform.
- **Tiger Brokers NZ (Tiger Trade)** — https://www.tigerbrokers.nz/ — online broker for NZ investors (NZ + global shares/ETFs; options/futures may exist on-platform — higher risk; do not push leveraged products). NZ entity Tiger Fintech (NZ) Limited; group associated with NASDAQ-listed UP Fintech / Tiger Brokers (TIGR).
- Other names sometimes mentioned on our how-it-works page: Interactive Brokers, Hatch — fine as further examples that alternatives exist.

Then: return to free AetherForge signup to track holdings with Stox / Headmaster. NOT AetherForge executing trades. NOT financial advice.

## Common crypto trading platforms (PASSIVE — only if asked)
If they ask about crypto exchanges / “where do people trade crypto?” (general, not NZ-specific), a reasonable “most common / popular by volume & familiarity in 2026” educational set is:
- **Binance**
- **OKX**
- **Bybit**
- **Coinbase**
- **Kraken**

Present as commonly used platforms, **not endorsements**. Mention: custody risk if leaving funds on an exchange; prefer understanding withdrawals/wallets; DYOR; not financial advice. Then steer back to free signup + **Koins** for tracking/analysis after they hold crypto.

## Buying cryptocurrency in New Zealand (PASSIVE — only if they ask about NZ)
Source: https://cryptocurrency.org.nz/buy-cryptocurrency-nz — “How to Buy Crypto in New Zealand | Cryptocurrency NZ” (updated May 2026).
AetherForge does not buy crypto and never takes custody. Only when asked how Kiwis typically get started, summarise neutrally (not “best”):
- **Retailers (simplest):** pay NZD, crypto to wallet; fees often ~0.5–2.5%. Example on that page: Pay It Now (payitnow.io).
- **Exchanges:** live markets / tighter spreads; custody risk if leaving funds there. Example: Binance NZ.
- **CFDs / advanced:** e.g. BlackBull Markets — FMA-regulated NZ broker; price exposure via CFDs/margin — NOT coins in a personal wallet; not for a first buy.
- **P2P:** community marketplaces — higher scam risk; verify carefully.
- Safety themes from that page: control your keys; hardware wallet for significant amounts; backup seed offline; IRD treats crypto as property; regulated NZ platforms require AML/KYC; BTC/ETH are common starting points but DYOR.

Then: invite [start free](/register?plan=free&redirect=/free-trial), add crypto holdings, use **Koins**. Never hard-sell a single exchange.

## Tone
Polite, friendly, calm Help Assistant. English only. The chat panel is small.
Default reply: two or three short sentences, one idea, plain language, then one free-signup invitation.
Do not open with a bullet list, a heading, or a tour of every bot and market.
Use a short list only when the visitor asks for steps, options, or more detail.
`.trim();

export const PERSONAL_GUIDE_SYSTEM_PROMPT = `
You are the **Help Assistant** for AetherForge AI — a friendly cartoon host on the marketing homepage.

**Language:** Reply in clear English only. Do not use Māori greetings (e.g. Kia ora), other languages, or mixed-language flourishes unless the visitor writes in another language first — and even then prefer English for product guidance.

Mission (in order):
1. Help visitors understand how AetherForge works and how to use the site effectively (Stox, Koins, The Headmaster, Smitty, portfolio setup, trial).
2. Gently convert them to a free signup: ${PERSONAL_GUIDE_SIGNUP_URL}
3. Answer educational questions about stocks, crypto, gold and silver at a product-guidance level — WITHOUT financial advice.

Reply shape (hard rule — the panel is small):
- Default: 2–3 short sentences, about 40–70 words. One idea. Plain language.
- No headings. No bullet or numbered list unless the visitor asks for steps, a list, options, or more detail.
- If the question is broad, answer the core and offer one follow-up. Do not preview every bot, broker, and market.
- When they ask for more detail, you may go a little longer (still under ~120 words). A short list is fine then.
- One soft signup link when it fits: [Start free](${PERSONAL_GUIDE_SIGNUP_URL}). That is the only active conversion.

Hard rules:
- Never name a model vendor, a model product, or a version. If asked what you are, say only that you are AI.
- NO personalized financial advice. Never tell someone to buy/sell a specific security.
- NEVER claim AetherForge holds money or places trades.
- **External platforms are passive-only.** Do not mention Sharesies, Tiger, Binance, OKX, Bybit, Coinbase, Kraken, Cryptocurrency NZ, Pay It Now, BlackBull, etc. unless the visitor asked how to buy/sell / which platforms people use / NZ on-ramps / similar.
- Never unsolicited CTA or recommendation toward those sites. No “you should open…”.
- When they DO ask buy/sell how-to: a few plain sentences with neutral examples from the knowledge base, note custody risk / DYOR / not advice, then return to AetherForge tracking + free signup. Do not dump every platform unless they ask for a list.
- Indexes (Dow Jones, NASDAQ, ASX): explain the one they asked about; conceptual ETF/broker exposure only; no product push. If they ask about indexes in general, one sentence and ask which one.
- Soft CTA: invite them to Start free when it fits naturally — that is the only active conversion target.
- If unsure, point to /how-it-works rather than inventing product features.

Knowledge base:
${PERSONAL_GUIDE_KNOWLEDGE}
`.trim();

const SIGNUP_LINK = `[Start free →](${PERSONAL_GUIDE_SIGNUP_URL})`;

function asksForDetail(q: string): boolean {
  return /more detail|more info|list|step.by.step|all the|every |options|compare|which ones|spell out/.test(
    q
  );
}

/** Lightweight offline replies when XAI_API_KEY is missing (dev / misconfig). */
export function personalGuideFallbackReply(userMessage: string): string {
  const q = userMessage.toLowerCase();

  if (/sign.?up|register|free.?trial|start free|create.?account/.test(q)) {
    return (
      `You can start free in about a minute. No card is needed for the free plan.\n\n` +
      `${SIGNUP_LINK}\n\n` +
      `After that you’ll land in the free trial, then add holdings on your Dashboard.`
    );
  }

  if (/dow\s*jones|djia/.test(q) && !/nasdaq|\basx\b/.test(q)) {
    return (
      `The Dow Jones tracks about 30 large U.S. companies. It is a snapshot, not a stock you buy directly. People usually get exposure through a fund at their own broker.\n\n` +
      `AetherForge doesn’t buy for you. ${SIGNUP_LINK} and Stox can track holdings you add.`
    );
  }

  if (/nasdaq/.test(q) && !/dow|\basx\b/.test(q)) {
    return (
      `NASDAQ is a major U.S. exchange. The Nasdaq-100 leans toward large technology companies. People usually get exposure through a fund or listed shares at their own broker.\n\n` +
      `AetherForge doesn’t buy for you. ${SIGNUP_LINK} and Stox can track holdings you add.`
    );
  }

  if (/\basx\b/.test(q) && !/dow|nasdaq/.test(q)) {
    return (
      `The ASX is Australia’s main share exchange. Many people in NZ look at ASX shares alongside NZX, through their own broker.\n\n` +
      `AetherForge doesn’t buy for you. ${SIGNUP_LINK} and Stox can track holdings you add.`
    );
  }

  if (/dow\s*jones|djia|nasdaq|\basx\b|index|indices|indexes/.test(q)) {
    return (
      `An index is a snapshot of many companies, not a stock you buy on its own. People usually get exposure through a fund at their own broker.\n\n` +
      `AetherForge doesn’t buy for you. ${SIGNUP_LINK} Which one do you mean — Dow, NASDAQ, or ASX?`
    );
  }

  if (/stock/.test(q) && /crypto/.test(q) && /buy|unsure|how/.test(q) && !asksForDetail(q)) {
    return (
      `You buy stocks and crypto at your own broker or exchange. AetherForge never places those trades.\n\n` +
      `Once you hold them, ${SIGNUP_LINK} and add them on the Dashboard so Stox and Koins can track them. Ask if you want a few NZ examples.`
    );
  }

  if (
    /sharesies|tiger(\s*brokers)?|buy.?share|sell.?share|broker|how (do|can) i (buy|invest|purchase).*(share|stock|etf)/.test(
      q
    )
  ) {
    if (asksForDetail(q)) {
      return (
        `AetherForge never buys or sells for you. You keep shares at your own broker.\n\n` +
        `Examples people in NZ use (not recommendations):\n` +
        `- [Sharesies](https://www.sharesies.nz/about)\n` +
        `- [Tiger Brokers NZ](https://www.tigerbrokers.nz/)\n` +
        `- Interactive Brokers and Hatch are other names you’ll see\n\n` +
        `Research them yourself. Then ${SIGNUP_LINK} and add the holdings so Stox can track them. Not financial advice.`
      );
    }
    return (
      `AetherForge never buys or sells for you. You keep shares at your own broker.\n\n` +
      `People in NZ often use Sharesies or Tiger Brokers NZ — examples, not recommendations. Ask if you want a few other names.\n\n` +
      `When you hold shares, ${SIGNUP_LINK} and track them here. Not financial advice.`
    );
  }

  if (
    /\b(binance|okx|bybit|coinbase|kraken)\b|crypto (exchange|platform|broker)|where.*(trade|buy).*crypto|popular crypto/.test(
      q
    ) && !/new zealand|\bnz\b|kiwi/.test(q)
  ) {
    if (asksForDetail(q)) {
      return (
        `Places people often trade crypto (examples, not recommendations): Binance, OKX, Bybit, Coinbase, and Kraken.\n\n` +
        `Leaving coins on an exchange has custody risk. AetherForge never holds crypto. ${SIGNUP_LINK} and use Koins to track what you own.`
      );
    }
    return (
      `People often trade crypto on exchanges such as Coinbase or Binance — examples, not recommendations. Leaving coins there has custody risk.\n\n` +
      `AetherForge never holds crypto. ${SIGNUP_LINK} and use Koins to track what you own.`
    );
  }

  if (
    /buy.?crypto|how (do|to) .*(crypto|bitcoin|\bbtc\b|\beth\b)|pay.?it.?now|blackbull|p2p|cryptocurrency\.org\.nz|(crypto|bitcoin).*(new zealand|\bnz\b|kiwi)/.test(
      q
    )
  ) {
    if (asksForDetail(q)) {
      return (
        `AetherForge never buys crypto for you.\n\n` +
        `A neutral NZ overview is [How to Buy Crypto in New Zealand](https://cryptocurrency.org.nz/buy-cryptocurrency-nz):\n` +
        `- Retailers: pay NZD, coins go to your wallet (that page mentions Pay It Now).\n` +
        `- Exchanges: live markets, with custody risk if coins stay there.\n` +
        `- CFDs and P2P are riskier and not a first buy.\n\n` +
        `Then ${SIGNUP_LINK} and add holdings so Koins can track them. Not financial advice.`
      );
    }
    return (
      `AetherForge never buys crypto for you. In New Zealand, people usually pay NZD through a retailer (coins go to a wallet) or use an exchange.\n\n` +
      `A neutral walkthrough is [How to Buy Crypto in New Zealand](https://cryptocurrency.org.nz/buy-cryptocurrency-nz). Ask if you want the retailer and exchange difference.\n\n` +
      `Then ${SIGNUP_LINK} and add the coins so Koins can track them.`
    );
  }

  if (/maximize|free plan|get the most|first step/.test(q)) {
    return (
      `On the free plan, the first step is to add the holdings you already have — ticker and amount.\n\n` +
      `${SIGNUP_LINK} Reports are more useful once that book is filled in. Ask for the next step after that.`
    );
  }

  if (/stox|koins|headmaster|smitty|\bbots?\b/.test(q)) {
    return (
      `Stox reads stocks, Koins reads crypto, and The Headmaster helps you set a goal plan. Smitty tracks gold and silver prices. There is no Smitty report.\n\n` +
      `${SIGNUP_LINK} You’ll meet them after you add holdings. Ask about one bot if you want just that.`
    );
  }

  if (/how (does|do)|how\b.{0,40}\bworks|what is aether|get started|\btrial\b/.test(q)) {
    return (
      `AetherForge tracks markets you already hold. It never places trades or holds your money.\n\n` +
      `${SIGNUP_LINK} Then add what you hold on the Dashboard.`
    );
  }

  if (/gold|silver|\bmetals?\b|crypto|bitcoin|ethereum|\bbtc\b|\beth\b|\bstocks?\b|\bshares?\b|\betfs?\b|\bmarkets?\b/.test(q)) {
    return (
      `AetherForge helps you track stocks, crypto, gold, and silver. I won’t tell you what to buy or sell.\n\n` +
      `${SIGNUP_LINK} when you want that on your Dashboard.`
    );
  }

  return (
    `I can help you start a free account, or explain how the site works in a sentence or two.\n\n` +
    SIGNUP_LINK
  );
}
