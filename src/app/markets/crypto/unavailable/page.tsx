import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { CryptoAssetPage } from "@/components/dashboard/CryptoAssetPage";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/markets/crypto/unavailable", {
  title: "Crypto · Markets · AetherForge AI",
  description: "This DEX token does not have a CoinGecko page. The price on the DEX list is still the one to record.",
});

/**
 * DEX rows with no CoinGecko id land here instead of a blank overlay.
 */
export default async function UnavailableCryptoPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; name?: string; buy?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  return (
    <MarketsAppFrame user={user}>
      <CryptoAssetPage
        coinId={null}
        unavailable
        symbol={sp.symbol ?? null}
        name={sp.name ?? null}
        signedIn={!!user}
        openFromQuery={sp.buy === "1"}
        market="DEX"
      />
    </MarketsAppFrame>
  );
}
