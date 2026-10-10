import Link from "next/link";
import { publicCryptoTableLines } from "@/lib/crypto-price-chain";
import type { PublicMarketIndex } from "@/lib/public-market-types";

/**
 * First page of each markets tab, rendered in the document so a fetch without
 * JavaScript still contains the rows.
 */
export function PublicMarketTables({ index }: { index: PublicMarketIndex }) {
  return (
    <section className="mt-8 space-y-6" aria-label="Listed prices">
      <h2 className="font-display text-lg font-bold">First page of each list</h2>
      <p className="text-sm text-muted-foreground">
        These rows are in the page itself. Crypto and DEX keep the last price that passed the check, with the time it was quoted. A stock price cell names its source and time, or says the print is not in this response.
      </p>
      {index.tabs.map((tab) => {
        const cryptoLines = publicCryptoTableLines(tab);
        const cryptoTab = tab.id === "CRYPTO" || tab.id === "DEX";
        return (
        <div key={tab.id}>
          <h3 className="font-display text-base font-semibold">
            {tab.title}{" "}
            <span className="text-sm font-medium text-muted-foreground">{tab.asOf}</span>
          </h3>
          {cryptoTab ? (
            <div className="mt-1 text-sm text-muted-foreground" data-public-crypto-prices>
              {cryptoLines.map((line) => (
                <p key={line} data-ticker-quote>
                  {line}
                </p>
              ))}
            </div>
          ) : null}
          {tab.coverage ? <p className="mt-1 text-sm text-muted-foreground">{tab.coverage}</p> : null}
          {tab.note ? <p className="text-xs text-muted-foreground">{tab.note}</p> : null}
          {tab.footnote ? <p className="text-xs text-muted-foreground">{tab.footnote}</p> : null}
          {tab.rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {cryptoTab ? "No earlier price is stored." : "No prices in this response."}
            </p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Ticker</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Change</th>
                  <th className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {tab.rows.map((row) => (
                  <tr key={`${tab.id}-${row.href}`} data-price-row className="border-b border-border/40">
                    <td className="py-1.5 pr-3">
                      <Link href={row.href} className="font-semibold text-primary hover:underline">
                        {row.symbol}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{row.name}</td>
                    <td className="py-1.5 pr-3 tnum">{row.price || "Not in this response"}</td>
                    <td className="py-1.5 pr-3 tnum">{row.change || "change not stated"}</td>
                    <td className="py-1.5 text-muted-foreground">
                      {row.source ? `${row.source}${row.asOf ? ` · ${row.asOf}` : ""}` : row.asOf || "Not in this response"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        );
      })}
    </section>
  );
}
