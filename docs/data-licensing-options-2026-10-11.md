# Data licensing options — 11 Oct 2026

Options only. Lukas decides. This file is not a public page.

This note does not claim that AetherForge holds an NZX licence, an ASX licence, or any other exchange licence. Nothing in the repository is a licence agreement.

Public pages already say prices for NZX-listed and ASX-listed shares, and for US shares, come from public market data (Yahoo Finance), and that they are not a direct NZX or ASX feed (`src/lib/data-sources.ts`). That sentence stays until Lukas chooses a different one.

Facts below were read from the code, from `wrangler.jsonc`, or from a public page fetched on 11 Oct 2026. A clause that was not on a page this note fetched is marked UNVERIFIED.

## What the code calls

- Shares: `https://query1.finance.yahoo.com` chart and spark (`src/lib/yahoo-finance.ts`). Twelve Data (`api.twelvedata.com`) runs only when `MARKET_DATA_API_KEY` is set (`src/lib/market-data.ts`). `wrangler.jsonc` does not set that key. Whether the live host sets it is UNVERIFIED.
- Crypto: `https://api.coingecko.com/api/v3` when keyless or when `COINGECKO_API_KEY` is a demo key. The demo header is `x-cg-demo-api-key`. `COINGECKO_PRO=on` switches the host to `https://pro-api.coingecko.com/api/v3` and the header to `x-cg-pro-api-key`. The key is not logged. A failed keyed call falls back to the keyless public host. `wrangler.jsonc` does not set the key. Runtime value UNVERIFIED. Set it in the host environment (Totalum env vars) if the keyless call is rate-limited. Swyftx is `https://api.swyftx.com.au` when that feed answers (`src/lib/crypto-swyftx.ts`).
- DEX: `https://api.geckoterminal.com/api/v2` (`src/lib/crypto-coingecko.ts`).
- Metals: `https://api.gold-api.com/price/` (`src/lib/metals.ts`).
- FX: `https://open.er-api.com/v6/latest/NZD` for the daily table (`src/lib/fx.ts`). A failed read uses `BASELINE_FX_TO_NZD` in code. Past dates use `https://api.frankfurter.app/` (`src/lib/fx.ts`).

## What the fetched pages say

Yahoo Finance US terms, `https://guce.yahoo.com/terms?locale=en-US`, fetched 11 Oct 2026:

- "you may not access or reuse the Services, or any portion thereof, for any commercial purpose."
- Ownership and Reuse: without explicit written permission, you must not reproduce, modify, rent, lease, sell, trade, distribute, transmit, broadcast, publicly perform, create derivative works based on, or exploit for any commercial purposes, any portion or use of, or access to, the Services, including content, advertisements, APIs, and software.

Yahoo Help, `https://help.yahoo.com/kb/exchanges-data-providers-yahoo-finance-sln2310.html`, fetched 11 Oct 2026:

- "You must not redistribute information displayed on or provided by Yahoo Finance."
- "All data provided on Yahoo Finance is provided for informational purposes only, and is not intended for trading or investing purposes."
- The delay table on that page lists New Zealand Stock Exchange (NZX) `.NZ` as 20 min, data provider ICE Data Services, and Australian Stock Exchange (ASX) `.AX` as 20 min, data provider ICE Data Services.
- The same page names LSEG Data and Analytics as a provider of economic events, non-US IPO, and insider transactions. A separate LSEG republication clause was not on the text extracted from that page. UNVERIFIED.

CoinGecko API terms (`https://www.coingecko.com/en/api_terms`) and pricing (`https://www.coingecko.com/en/api/pricing`) returned a challenge page on 11 Oct 2026, not the terms. Attribution, resale, and paid-plan rules are UNVERIFIED.

GeckoTerminal terms, `https://www.geckoterminal.com/terms-conditions`, fetched 11 Oct 2026:

- The GeckoTerminal API is described as available for use without any charges, subject to compliance with its API Terms of Service.
- Screen captures are allowed on a non-commercial site with attribution to GeckoTerminal.
- The API Terms of Service themselves were not fetched. What those terms say about redistribution is UNVERIFIED.

ExchangeRate-API terms, `https://www.exchangerate-api.com/terms`, fetched 11 Oct 2026. The page says the service includes `er-api.com`:

- Free Plan and paid accounts are suitable for commercial or personal use.
- Data is only suitable for informational or illustrative purposes. Use for actual transactions or as financial data is explicitly not recommended.
- The licence is non-transferable, non-exclusive, revocable, and limited. You may not lease, sell, rent, or otherwise transfer the use of ExchangeRate-API to a third party.

Frankfurter docs, `https://www.frankfurter.app/docs/`, fetched 11 Oct 2026:

- The page says the API is free and that commercial use of the API is yes, and that the rates themselves fall under each provider's terms.
- The same page says the public API lives at `api.frankfurter.dev`.
- The application calls `api.frankfurter.app`. This note does not confirm those two hosts are one contract.

gold-api.com terms, `https://gold-api.com/terms`, fetched 11 Oct 2026. Effective date on that page: 10 Sep 2026.

- The service is a free data API for past and current gold and silver prices, provided as is.
- Section 9 says commercial use of the API is always permitted, including web applications.
- Section 4 says multiple requests per second, or other abuse, can lead to a ban. The marketing line "No Rate Limiting" on the home page is a different sentence from section 4.

Swyftx terms were not fetched. UNVERIFIED.

## Options

1. Keep the current Yahoo calls and the current public sentence (public market data, not a direct NZX or ASX feed, delayed, information only). The Yahoo terms quoted above restrict commercial reuse and redistribution unless Yahoo has given written permission. This option does not say the current display is permitted.

2. Ask Yahoo, or the exchange data provider named on the Yahoo help page, for written permission before NZX or ASX prices stay on a paid product. Until that permission is in hand, do not say the product is licensed, official, or real-time. A later choice can be to stop showing those prices on paid pages.

3. CoinGecko: keep the keyless call, or set `COINGECKO_API_KEY` on the host. A demo key uses `x-cg-demo-api-key` on `api.coingecko.com`. `COINGECKO_PRO=on` uses the Pro host and `x-cg-pro-api-key`. Keyless remains the fallback. Do not add an attribution line, and do not claim a right to resell the feed, until someone has read the current API terms. Those terms were UNVERIFIED on 11 Oct 2026. The key is not written to logs.

4. GeckoTerminal: keep the public line that DEX prices come from GeckoTerminal. The site terms say the API is free of charge and subject to API terms. Those API terms were UNVERIFIED. Do not claim a DEX licence.

5. FX and metals: ExchangeRate-API and gold-api.com terms, as fetched, allow commercial informational use with the limits in those pages. Frankfurter's fetched docs say commercial use is free and that each rate provider's terms still apply. Swyftx stays UNVERIFIED until its terms are read. None of these are an NZX or ASX licence.

Lukas picks the option. This file does not pick one.
