# Stock listing sources — 10 Oct 2026

Counts only, unless the terms below allow the names to be stored. This note does not claim an exchange licence, an official feed, or a real-time feed.

| Board | Before this change | Shown after | Count compared |
| --- | --- | --- | --- |
| NZX | 60 names in `MARKET_UNIVERSE` | 60 | 178 NZSX instruments on `https://www.nzx.com/markets/NZSX` (172 were share-category). All 60 repo codes were in that page. |
| ASX | 217 names in `MARKET_UNIVERSE` | 212 | 1,923 data rows in `ASXListedCompanies.csv` stamped `Sun Oct 11 06:14:38 AEDT 2026`. Five repo codes were not in that file: ASK, OPT, QUB, VAU, WR1. |
| Dow Jones | 30 | 30 | The index has 30 constituents. The 30 names were already in the repo. |
| NASDAQ tab | 90 US names that are not in the Dow set. That was not a Nasdaq list. | 4,376 | Nasdaq directory `nasdaqlisted.txt` created `1009202621:31` (9 Oct 2026 21:31): 5,622 non-test symbols, of which 1,293 were flagged ETF. |
| NYSE | No tab. 25 of the old US names are tagged NYSE in the SEC file. | 3,290 | Other-listed directory `otherlisted.txt`, same creation time, exchange code N: 2,900 non-test symbols (2,821 excluding funds). |

NZX terms, `https://www.nzx.com/meta-pages/terms-of-use`, fetched 10 Oct 2026: "You may not use, copy or modify this website for any purpose other than to view information about our products and service and NZX." The NZSX names are not copied into this repo. The same page says market data on the NZX website is delayed by 20 minutes. This product does not call that website for prices.

ASX terms, `https://www.asx.com.au/legals/terms-of-use`, fetched 10 Oct 2026: content may be saved for private study or other personal, non-commercial use, and it may not be reproduced or distributed without consent. The company file is not copied into this repo. The directory page also points at an LSEG restriction and a vendor restriction: republication of that content is prohibited without prior written consent.

Nasdaq Trader copyright page, `https://www.nasdaqtrader.com/Trader.aspx?id=CopyDisclaimMain`, fetched 10 Oct 2026: website content may not be copied except for fair use and one personal non-commercial copy, and it says Nasdaq stock symbols are proprietary. The directory files are not copied into this repo. The symbol counts above are facts from those files.

SEC company file, `https://www.sec.gov/files/company_tickers_exchange.json`, retrieved 10 Oct 2026. It is a work of the United States government (17 U.S.C. § 105). The names and tickers tagged Nasdaq (4,376) and NYSE (3,290) are stored in `src/data/listings/sec-nasdaq.json` and `src/data/listings/sec-nyse.json`. That file does not include every fund in the Nasdaq directory. The Nasdaq directory count (5,622) and the other-listed NYSE count (2,900) are recorded in this note only. They are not the visitor "of M" figure.

Yahoo stays the first price call, as it already was. Yahoo terms, already quoted in `docs/data-licensing-options-2026-10-11.md`, restrict commercial reuse. This change does not say that display is permitted. Yahoo Help, recorded in that same note, lists NZX and ASX as 20 minutes. US minutes are still unconfirmed, so the US label stays `Delayed` without a minute figure.

Twelve Data (`https://api.twelvedata.com/quote`) is called only when `MARKET_DATA_API_KEY` is set, after Yahoo, with a timeout and a circuit breaker. `wrangler.jsonc` does not set that key. Whether the host sets it, and whether the Twelve Data plan allows this display, is for Lukas. Public copy does not name Twelve Data.

Provider order on a stock page: Yahoo Finance, then Twelve Data if a key is set, then the last saved print. Each provider has its own timeout. Three failures open a 60 second circuit. A print at or below zero is dropped. A print more than double or less than half the saved price is held until a second print agrees with it. The row names the source and the vendor time. There is no new database column. Crypto files are not part of this change.

Wikidata ASX tickers were counted and were fewer than the names already in the repo, so they are not used. Stooq and Yahoo bulk symbol lists were not copied. Their terms do not clearly allow storing a full exchange directory here.

## Sitemap and thin US pages

The SEC file has a company name and a ticker. It does not state a sector, and it has no ETF flag. NASDAQ and NYSE boards therefore say `includes funds and other security types; type not stated by the source`. Rows are not labelled ETF.

`/sitemap.xml` lists:

- every NZX name in this catalog
- every ASX name in this catalog
- every Dow Jones name in this catalog
- at most 300 other US names that have a verified company name and either a stated sector from the repo list or a saved print whose time is within 14 days

Warrants, units, rights, and test-like issues are left out of the sitemap. A name matches when it contains the words warrant, unit, right, or test. A ticker matches when a 4-letter issuer is followed by W, U, R, WS, WT, WD, or RT (for example AACIU and AACIW). Nasdaq test symbols of the form Z?ZZT are left out. A 4-letter ticker such as GROW stays.

Other US pages stay on the site. When that response has no quote, the page sends `noindex` and `follow`. A visitor can still open it. NZX, ASX, Dow, and the US names that are in the sitemap stay indexable. A US page outside that set stays indexable when the response includes a quote.

## Visitor count after pull-check:retest4-2026-10-11

Visitor lines are `Showing N of M listed`. For NASDAQ and NYSE, M is the SEC-derived count of the population on screen, so N does not exceed M.

The default NASDAQ and NYSE boards hide warrants, units, rights, and test-like issues. NYSE hyphen suffixes `-WT`, `-WTA`, `-UN`, and `-RI` are in that set. M is then the ordinary-name count. The control `Include warrants, units and rights` uses the full SEC population, and the line says those issues are included.

The Nasdaq directory file (5,622 non-test symbols, created 9 Oct 2026 21:31) and the other-listed NYSE directory (2,900 non-test symbols) stay in this note. They are not printed on the boards.
