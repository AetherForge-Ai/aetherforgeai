import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { CryptoAssetPage } from "@/components/dashboard/CryptoAssetPage";
import { resolvableCoinId } from "@/lib/crypto-market";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return publicPageMetadata(`/markets/crypto/${id}`, {
    title: "Crypto · Markets · AetherForge AI",
    description: "A coin from the AetherForge markets list. Paper research, not a broker.",
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
  searchParams: Promise<{ buy?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const coinId = resolvableCoinId(id);
  const allowBuy = !!user && sp.buy === "1";

  return (
    <MarketsAppFrame user={user}>
      <CryptoAssetPage coinId={coinId} unavailable={!coinId} allowBuy={allowBuy} />
    </MarketsAppFrame>
  );
}
