import { formatPublicCryptoPrice, type ChainPrint } from "@/lib/crypto-price-chain";

/**
 * Server-rendered crypto prices. A zero, blank, or loading line is not emitted.
 * pull-check:crypto-dex-400-2026-10-11
 */
export function PublicCryptoPrices({
  prints,
  empty = "No earlier price is stored.",
}: {
  prints: ChainPrint[];
  empty?: string;
}) {
  const lines = prints.map((print) => formatPublicCryptoPrice(print)).filter(Boolean);
  if (!lines.length) {
    return (
      <p className="text-sm text-muted-foreground" data-public-crypto-prices>
        {empty}
      </p>
    );
  }
  return (
    <div data-public-crypto-prices>
      {lines.map((line) => (
        <p key={line} className="text-sm text-muted-foreground" data-ticker-quote>
          {line}
        </p>
      ))}
    </div>
  );
}
