import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { CryptoAssetPage } from "@/components/dashboard/CryptoAssetPage";
import { resolvableCoinId } from "@/lib/crypto-market";
import { loadCryptoQuoteLine } from "@/lib/public-market-index";

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
  const quoteLine = coinId ? await loadCryptoQuoteLine(coinId) : null;

  return (
    <MarketsAppFrame user={user}>
      <p className="mx-auto w-full max-w-6xl px-4 pt-6 text-sm text-muted-foreground sm:px-6 lg:px-8" data-ticker-quote>
        {quoteLine ?? `${decodeURIComponent(id)} Price not in this response.`}
      </p>
      <CryptoAssetPage
        coinId={coinId}
        unavailable={!coinId}
        allowBuy={allowBuy}
        signedIn={!!user}
        openFromQuery={sp.buy === "1"}
        market={sp.market === "dex" ? "DEX" : "Crypto"}
      />
    </MarketsAppFrame>
  );
}
