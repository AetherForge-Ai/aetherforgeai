# AI disclosure notes for Lukas — 11 Oct 2026

This file is not a public page. Public pages say "AI" and "a third-party AI service". They do not name a model or a provider. This file follows that rule. The host, the model id, and the environment variable live in the server module that posts the completion. They are not copied here.

Retention and training at that service are not set by the request the code sends. Both are to be confirmed by Lukas. They are not stated on the public page.

## What the code does

The server completion function posts JSON to a third-party HTTPS endpoint. The body fields are the model id, `messages`, `max_tokens`, `temperature`, and `stream: false`. The request uses an `Authorization` bearer header when the server environment variable is set. The body does not include a retention period or a training flag.

If that environment variable is missing, the function throws and the caller does not receive a completion. `wrangler.jsonc` does not set the variable. Whether the live host sets it is UNVERIFIED.

## Where a completion is used

- Assistant (`src/app/api/chat/route.ts`). The system text includes the signed-in person's name and, when the book has rows, a portfolio context from `buildPortfolioContext` (`src/lib/ai-context.ts`): holding count, market value, cost, profit and loss, sector weights, and each holding's ticker, name, share count, average price, current price, value, and weight. The call also sends up to 12 stored chat messages. The assistant reply is stored on `chat_message`.
- Ticker note (`src/app/api/ticker-analysis/route.ts`). The call sends the person's name, the ticker, the name, the question (or a fixed question if none was typed), and a quote line when Yahoo returns one: price, currency, session change, day high, day low, 52-week range, previous close. The route does not write that reply into `chat_message`.
- Trial summary (`enhanceWithGrok` in `src/lib/trial-report.ts`). When the server variable is set, the call can replace the executive summary and key findings. The text sent includes ticker, name, price, window changes, RSI, MACD, signal, model percents, and a holding line (shares, average price, profit and loss) when a holding was supplied. `aiEnhanced` becomes true only when that call returns text. The screen label is "AI-written note" (`src/components/trial/TrialReportView.tsx`).
- A product-note helper (`loadScenario` in `src/lib/product-note-live.ts`) can send a facts string and ask for at most two sentences. This note does not send email.

A stored member report sets `aiEnhanced` to false in `src/lib/report-service.ts`. That summary is built from the calculated figures. It is not given the "AI-written note" label.

The chat pane and the ticker pane show the words "AI-written note" on the assistant reply (`src/components/chat/ChatAssistant.tsx`, `src/components/dashboard/TickerAnalysisPane.tsx`).

The routes above build the request from those fields. They do not put a card number in the body. Stripe is a separate processor. The public line is that we never see the card number (`PROCESSORS` in `src/lib/public-copy.ts`).

## What is on the public pages

`/trust` ("What the AI does") and Privacy section 4 say:

- a third-party AI service writes the plain-English ticker note and the assistant replies
- those notes are labelled "AI-written note"
- scores and ranges are from the rules engine
- a stored member report is not marked AI-enhanced
- the request can include the question, the name, recent chat messages, the ticker and quote, and paper-book figures (tickers, quantities, and prices)
- the request does not include a card number
- the code that sends the request does not set a retention period

Vendor retention, and whether the service trains on the text, are to be confirmed by Lukas. They are not on `/trust` or `/privacy-policy`.
