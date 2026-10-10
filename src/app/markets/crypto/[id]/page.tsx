import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { CryptoAssetPage } from "@/components/dashboard/CryptoAssetPage";
import { PublicCryptoPrices } from "@/components/markets/PublicCryptoPrices";
import { resolvableCoinId } from "@/lib/crypto-market";
import { formatPublicCryptoPrice } from "@/lib/crypto-price-chain";
import { loadPublicCryptoPrint } from "@/lib/crypto-price-feed";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const label = decodeURIComponent(id);
  return publicPageMetadata(`/markets/crypto/${id}`, {
    title: `${label} · Crypto · AetherForge AI`,
    description: `${label} on AetherForge markets. Paper research, not a broker.`,
  });
}

/**
 * /markets/crypto/[id] — shareable coin page. [id] is the CoinGecko slug.
 */
export default async function CryptoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ buy?: string; market?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const coinId = resolvableCoinId(id);
  const allowBuy = !!user && sp.buy === "1";
  const print = coinId ? await loadPublicCryptoPrint(coinId) : null;
  const quotedLine = print && print.price > 0 ? formatPublicCryptoPrice(print) : "";

  return (
    <MarketsAppFrame user={user}>
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        <PublicCryptoPrices
          prints={print && print.price > 0 ? [print] : []}
          empty={`${decodeURIComponent(id)} No earlier price is stored for this coin.`}
        />
      </div>
      <CryptoAssetPage
        coinId={coinId}
        unavailable={!coinId}
        allowBuy={allowBuy}
        signedIn={!!user}
        openFromQuery={sp.buy === "1"}
        market={sp.market === "dex" ? "DEX" : "Crypto"}
        quotedLine={quotedLine || null}
      />
    </MarketsAppFrame>
  );
}
