import Link from "next/link";
import type { PublicMarketIndex } from "@/lib/public-market-types";
import { RowAsOf } from "@/components/markets/RowAsOf";

/**
 * First page of each markets tab, rendered in the document so a fetch without
 * JavaScript still contains the rows.
 */
export function PublicMarketTables({ index }: { index: PublicMarketIndex }) {
  const tabs = index.tabs.filter((tab) => tab.id === "CRYPTO" || tab.id === "DEX");
  return (
    <section className="mt-8 space-y-6" aria-label="Listed prices">
      <h2 className="font-display text-lg font-bold">First page of the crypto lists</h2>
      <p className="text-sm text-muted-foreground">
        These rows are in the page itself. Crypto and DEX keep the last price that passed the check, with the time it was quoted. A stock price cell names its source and time, or says the print is not in this response.
      </p>
      {tabs.map((tab) => {
        const cryptoTab = tab.id === "CRYPTO" || tab.id === "DEX";
        return (
        <div key={tab.id}>
          <h3 className="font-display text-base font-semibold">
            {tab.title}{" "}
            <span data-stale={/Stale:/.test(tab.asOf || "") ? "1" : undefined} className={`text-sm font-medium ${/Stale:/.test(tab.asOf || "") ? "text-amber-700" : "text-muted-foreground"}`}>{tab.asOf}</span>
          </h3>
          {tab.coverage ? <p className="mt-1 text-sm text-muted-foreground">{tab.coverage}</p> : null}
          {tab.note ? <p className="text-xs text-muted-foreground">{tab.note}</p> : null}
          {tab.footnote ? <p className="text-xs text-muted-foreground">{tab.footnote}</p> : null}
          {tab.rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {cryptoTab ? "No earlier price is stored." : "No prices in this response."}
            </p>
          ) : (
            // b33 M-7: at 390 px the table overflowed its dark panel onto the light page (#94a3b8 on
            // #f8fafc, 2.45:1). Scroll it inside the panel instead (keyboard-focusable region).
            <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label={`${tab.title} prices (scrolls sideways)`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3">Ticker</th>
                  <th scope="col" className="py-2 pr-3">Name</th>
                  <th scope="col" className="py-2 pr-3">Price</th>
                  <th scope="col" className="py-2 pr-3">Change</th>
                  {cryptoTab ? <th scope="col" className="py-2 pr-3">1h</th> : null}
                  {cryptoTab ? <th scope="col" className="py-2 pr-3">7d</th> : null}
                  {cryptoTab ? <th scope="col" className="py-2 pr-3">Supply</th> : null}
                  {cryptoTab ? <th scope="col" className="py-2 pr-3">{tab.id === "DEX" ? "Chain" : "Blockchain"}</th> : null}
                  {tab.id === "DEX" ? <th scope="col" className="py-2 pr-3">DEX</th> : null}
                  <th scope="col" className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {tab.rows.map((row) => (
                  <tr key={`${tab.id}-${row.href || `${row.symbol}-${row.blockchain || ""}`}`} data-price-row className="border-b border-border/40">
                    <td className="py-1.5 pr-3">
                      {row.href ? (
                        <Link href={row.href} className="font-semibold text-primary hover:underline">
                          {row.symbol}
                        </Link>
                      ) : (
                        <span className="font-semibold" title="No coin page: the source does not report cap, volume and supply for this pool token.">{row.symbol}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{row.name}</td>
                    <td className="py-1.5 pr-3 tnum">{row.price || "Not in this response"}</td>
                    <td className="py-1.5 pr-3 tnum">{row.change || "—"}</td>
                    {cryptoTab ? <td className="py-1.5 pr-3 tnum" title={row.change1h === "—" ? "The feed did not send a 1-hour change." : undefined}>{row.change1h || "—"}</td> : null}
                    {cryptoTab ? <td className="py-1.5 pr-3 tnum" title={row.change7d === "—" ? "The feed did not send a 7-day change." : undefined}>{row.change7d || "—"}</td> : null}
                    {cryptoTab ? <td className="py-1.5 pr-3 tnum" title={row.supply === "—" ? "The feed did not send circulating supply." : undefined}>{row.supply || "—"}</td> : null}
                    {cryptoTab ? <td className="py-1.5 pr-3">{row.blockchain || "—"}</td> : null}
                    {tab.id === "DEX" ? <td className="py-1.5 pr-3">{row.dex || "—"}</td> : null}
                    <td className="py-1.5 text-muted-foreground">
                      <RowAsOf source={row.source} asOf={row.asOf} quotedAt={row.quotedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
        );
      })}
    </section>
  );
}
