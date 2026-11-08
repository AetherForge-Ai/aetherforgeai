# Broker files the importer reads

Checked against the synthetic fixtures in `src/lib/fixtures/broker-import`. Those files are not customer exports. A layout that is not listed here is not claimed.

A readable CSV that is not one of these layouts opens the column map. The map uses the same exchange-rate rules. An empty file, or a file that is not a CSV, is the only case labelled unreadable.

## Sharesies

Detected when the header has `Instrument code` or `Instrument name`, or both `Company` and `Type`.

Columns the fixtures use:

- `Date`, `Type`, `Quantity`, `Price`
- `Instrument code` and/or `Instrument name` (a `Company` column is the name when there is no code)
- `Value` when present. It must equal quantity times price, to the cent
- `Currency` (`NZD`, `AUD`, or `USD`)
- `Exchange rate` (NZD per 1 unit of the trade currency). Optional for NZD. Optional for AUD and USD only when a reviewed rate exists for that trade date

`Type` of Buy or Sell is saved. Dividend, split, and the other non-trade types are listed and not saved.

A cell that is a ticker code is kept as written. A company name is used only when the normalised name matches exactly one listing in the stock list (legal suffixes such as Limited and Inc are ignored, and `&` is read as "and"). If the name matches more than one ticker, the row is not saved and the tickers are listed. The file currency picks one ticker only when that leaves a single match: NZD with one `.NZ` ticker, AUD with one `.AX` ticker, or USD with one ticker that has no suffix. Nothing is guessed.

## Hatch

Detected when the header has `Trade Date`, `Action`, and `Symbol`.

Columns the fixture uses: `Trade Date`, `Action`, `Symbol`, `Quantity`, `Price`, `Commission`, `Currency`, `FX Rate`, `Value`.

`Action` of BUY or SELL is saved. The same exchange-rate rule as Sharesies applies.

## IBKR

Detected when the header has `ClientAccountID` or `Buy/Sell`.

Columns the fixture uses: `TradeDate`, `Symbol`, `Quantity`, `TradePrice`, `IBCommission`, `Buy/Sell`, `CurrencyPrimary`, `FXRateToBase`, `Proceeds`.

A negative quantity is read as a size. Buy/Sell sets the side. The same exchange-rate rule applies. A USD rate below 1 is turned around, because that file sometimes quotes the other direction.

## Generic CSV

Any other readable CSV asks for Date, Ticker, Side, Quantity, and Price. Fee, currency, exchange rate, and value are optional. Foreign rows follow the same reviewed trade-date rate rule.

## Paper deposits

`Add paper deposits to fund buys` starts off. A buy that would make paper cash negative is left out until that choice is on. The deposit is paper cash. It is not money from the file.
