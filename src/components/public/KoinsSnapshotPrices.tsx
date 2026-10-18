import { readSharedCryptoBoard } from "@/lib/crypto-board-store";
import { formatDisplayDate, formatMoney } from "@/lib/currency";

const PREFERRED = ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "BNB", "LINK"];

/**
 * Public Koins prices from the same snapshot the markets list uses.
 * USD only. NZ$ is not invented when today's exchange rate is not on this page.
 */
export async function KoinsSnapshotPrices() {
  let coins: { symbol: string; name: string; price: number; change24h: number | null }[] = [];
  let asOf = "";
  try {
    const board = await readSharedCryptoBoard({ seed: false, revalidate: true });
    asOf = board.at ? formatDisplayDate(board.at) : "";
    const priced = board.coins.filter((coin) => coin.price > 0);
    const preferred = PREFERRED.map((symbol) => priced.find((coin) => coin.symbol.toUpperCase() === symbol)).filter(
      (coin): coin is (typeof priced)[number] => Boolean(coin)
    );
    const shown = (preferred.length ? preferred : priced.slice(0, 8)).slice(0, 8);
    coins = shown.map((coin) => ({
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.price,
      change24h: coin.moves?.h24 ?? (Number.isFinite(coin.change24h) ? coin.change24h : null),
    }));
  } catch {
    coins = [];
  }

  return (
    <section className="mt-10" aria-label="Snapshot prices">
      <h2 className="font-display text-2xl font-bold">Snapshot prices</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        USD prices from the shared crypto snapshot
        {asOf && asOf !== "—" ? `, as at ${asOf}` : ""}. These rows are not a member book and they are not a
        recommendation. Crypto projections stay paused.
      </p>
      {coins.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No crypto price is on the shared snapshot.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-2 font-medium">Coin</th>
              <th scope="col" className="py-2 text-right font-medium">Price</th>
              <th scope="col" className="py-2 text-right font-medium">24h</th>
            </tr>
          </thead>
          <tbody>
            {coins.map((coin) => (
              <tr key={coin.symbol} className="border-b border-border/40">
                <td className="py-2">
                  <span className="font-semibold">{coin.symbol}</span>
                  {" "}<span className="ml-1 text-muted-foreground">{coin.name}</span>
                </td>
                <td className="py-2 text-right">{formatMoney(coin.price, "USD")}</td>
                <td className="py-2 text-right">
                  {coin.change24h == null || !Number.isFinite(coin.change24h) ? "—" : `${coin.change24h > 0 ? "+" : ""}${coin.change24h.toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
