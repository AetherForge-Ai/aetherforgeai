# AI disclosure notes for Lukas — 11 Oct 2026

This file is not a public page. Public pages say "AI" and "a third-party AI service". They do not name a model or a provider. This file follows that rule. The host, the model field, and the environment variable live in the server module that posts the completion. They are not copied here.

Retention and training at that service are not set by the request the code sends. Both are to be confirmed by Lukas. They are not stated on the public page.

## What the code does

The server completion function posts JSON to a third-party HTTPS endpoint. The body fields are the model field, `messages`, `max_tokens`, `temperature`, and `stream: false`. The request uses an `Authorization` bearer header when the server environment variable is set. The body does not include a retention period or a training flag.

If that environment variable is missing, the function throws and the caller does not receive a completion. `wrangler.jsonc` does not set the variable. Whether the live host sets it is UNVERIFIED.

## Where a completion is used

- Assistant (`src/app/api/chat/route.ts`). The system text includes the signed-in person's name and, when the book has rows, a portfolio context from `buildPortfolioContext` (`src/lib/ai-context.ts`): holding count, total market value, total cost, total unrealised profit or loss, best and worst performer, sector weights, and for each holding the ticker, the name, the sector, the share count, the average price, the current price, the value, the profit or loss, and the weight. The call also sends up to 12 stored chat messages. The assistant reply is stored on `chat_message`.
- Portfolio Execution Coach (`src/app/api/portfolio-coach/route.ts`). The call sends the member's name, the question, and up to 12 earlier messages. When a Headmaster book is available it also sends the cash balance, the total value, the profit or loss, the diversification score and its label, and the allocation weights and values in NZ$, including cash. It sends the top eight positions with name, asset class, weight and value, the latest Stox and Koins findings, and the Headmaster ideas for names in the book. Watchlist names are not included. It can include a plan the member typed and report text the member attached.
- Headmaster chat (`src/app/api/totalum/chat/route.ts`). The call sends the member's name, the question, and up to 12 earlier messages. The book text includes the total value, the total cost, the profit or loss, the cash balance, the cash weight, the retained-cash target, the illustrated cash reallocation, and the working that produces that reallocation. It includes each asset class with its weight, its value in NZ$ and its position count, the top eight positions with name, asset class, weight, value and profit or loss, concentration-risk notes, stress-test impacts in NZ$ and percent, and the bull, base and bear scenario pathways. When the book is invested it includes the diversification score and HHI. It includes a calculated yearly return and volatility for the mix. It also sends the latest Stox and Koins findings and the Headmaster ideas block. Names outside the book are included only when the question asks for a watchlist.
- Ticker note (`src/app/api/ticker-analysis/route.ts`). The call sends the person's name, the ticker, the name, the question you typed (or a short default question if none was typed), and a quote line when Yahoo returns one: price, currency, session change, day high, day low, 52-week range, previous close. The route does not write that reply into `chat_message`.
- Trial summary: the trial summary function in src/lib/trial-report.ts. When the server variable is set, the call can replace the executive summary and key findings. The text sent includes ticker, name, price, window changes, RSI, MACD, signal, calculated percents, and a holding line (shares, average price, profit and loss) when a holding was supplied. `aiEnhanced` becomes true only when that call returns text. The screen label is "AI-written note" (`src/components/trial/TrialReportView.tsx`).
- A product-note helper (`loadScenario` in `src/lib/product-note-live.ts`) can send a facts string and ask for at most two sentences. This note does not send email.

A stored member report sets `aiEnhanced` to false in `src/lib/report-service.ts`. That summary is built from the calculated figures. It is not given the "AI-written note" label.

The chat pane and the ticker pane show the words "AI-written note" on the assistant reply (`src/components/chat/ChatAssistant.tsx`, `src/components/dashboard/TickerAnalysisPane.tsx`).

The routes above build the request from those fields. They do not put a card number in the body. Stripe is a separate processor. The public line is that we never see the card number (`PROCESSORS` in `src/lib/public-copy.ts`).

## What is on the public pages

`/trust` ("What the AI does") and Privacy section 4 use `AI_REQUEST_LINES` in `src/lib/public-copy.ts`. Those lines name the assistant, the Portfolio Execution Coach, and the Headmaster chat, and they list the categories above. They say the request does not include a card number, and that the code that sends the request does not set a retention period.

Vendor retention, and whether the service trains on the text, are to be confirmed by Lukas. They are not on `/trust` or `/privacy-policy`.
