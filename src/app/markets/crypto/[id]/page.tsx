import type { Metadata } from "next";
import { cache } from "react";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { CryptoAssetPage } from "@/components/dashboard/CryptoAssetPage";
import { PublicCryptoPrices } from "@/components/markets/PublicCryptoPrices";
import { resolvableCoinId } from "@/lib/crypto-market";
import { formatPublicCryptoPrice, type ChainPrint } from "@/lib/crypto-price-chain";
import { loadPublicCryptoPrint } from "@/lib/crypto-price-feed";
import { peekTop400 } from "@/lib/crypto-coingecko";
import { getFxSnapshot } from "@/lib/fx";
import { pageTitle } from "@/lib/page-title";
import { cryptoDetailCopy, cryptoDetailJsonLd, vendorByCoingeckoId, type CryptoDetailFacts } from "@/lib/crypto-public-meta";

export const dynamic = "force-dynamic";

const siteOrigin = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

/**
 * One read for the document title and the page.
 * NZD is included only when the FX snapshot was sourced. Market cap comes from
 * the CoinGecko list already in memory, and only when that figure is positive.
 *
 * pull-check:retest4-2026-10-11
 */
const loadCryptoDetailFacts = cache(async (id: string): Promise<{ facts: CryptoDetailFacts; print: ChainPrint | null }> => {
  const slug = resolvableCoinId(id) || decodeURIComponent(id).trim().toLowerCase();
  const vendor = vendorByCoingeckoId(slug);
  const coinId = resolvableCoinId(id);
  const print = coinId ? await loadPublicCryptoPrint(coinId) : null;
  const listed = peekTop400()?.coins.find((coin) => coin.id === slug) ?? null;
  const priceUsd = print && print.price > 0 ? print.price : listed && listed.price > 0 ? listed.price : null;
  let priceNzd: number | null = null;
  let nzdSourced = false;
  if (priceUsd != null) {
    const fx = await getFxSnapshot();
    const perUsd = fx.ratesToNZD.USD;
    if (fx.sourced && perUsd > 0) {
      nzdSourced = true;
      priceNzd = priceUsd * perUsd;
    }
  }
  const marketCap = listed && listed.marketCap > 0 ? listed.marketCap : null;
  return {
    print,
    facts: {
      slug,
      name: vendor?.name || listed?.name || null,
      symbol: vendor?.ticker || listed?.symbol || print?.symbol || null,
      priceUsd,
      priceNzd,
      nzdSourced,
      asOf: print?.quotedAt || listed?.quotedAt || null,
      source: print?.source || (listed && priceUsd != null ? "coingecko" : null),
      marketCapUsd: marketCap,
    },
  };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const copy = cryptoDetailCopy((await loadCryptoDetailFacts(id)).facts);
  return publicPageMetadata(`/markets/crypto/${id}`, copy);
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
  const loaded = await loadCryptoDetailFacts(id);
  const copy = cryptoDetailCopy(loaded.facts);
  const jsonLd = cryptoDetailJsonLd({
    title: pageTitle(copy.title),
    description: copy.description,
    url: `${siteOrigin}/markets/crypto/${encodeURIComponent(id)}`,
  });
  const print = loaded.print;
  const quotedLine = print && print.price > 0 ? formatPublicCryptoPrice(print) : "";

  return (
    <MarketsAppFrame user={user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        <PublicCryptoPrices
          prints={print && print.price > 0 ? [print] : []}
          empty={`${decodeURIComponent(id)} No earlier price is stored for this coin.`}
        />
      </div>
      <CryptoAssetPage
        coinId={coinId}
        unavailable={!coinId}
        allowBuy={!!user && sp.buy === "1"}
        signedIn={!!user}
        openFromQuery={sp.buy === "1"}
        market={sp.market === "dex" ? "DEX" : "Crypto"}
        quotedLine={quotedLine || null}
      />
    </MarketsAppFrame>
  );
}
