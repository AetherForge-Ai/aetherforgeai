import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { CryptoAssetPage } from "@/components/dashboard/CryptoAssetPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crypto · Markets · AetherForge AI",
};

/**
 * DEX rows with no CoinGecko id land here instead of a blank overlay.
 */
export default async function UnavailableCryptoPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string; name?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  return (
    <MarketsAppFrame user={user}>
      <CryptoAssetPage coinId={null} unavailable symbol={sp.symbol ?? null} name={sp.name ?? null} />
    </MarketsAppFrame>
  );
}
