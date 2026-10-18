import type { Metadata } from "next";
import { cache } from "react";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { MarketsAppFrame } from "@/components/dashboard/MarketsAppFrame";
import { CryptoAssetPage } from "@/components/dashboard/CryptoAssetPage";
import { PublicCryptoPrices } from "@/components/markets/PublicCryptoPrices";
import { resolvableCoinId, type CoinDetail } from "@/lib/crypto-market";
import { formatPublicCryptoPrice, type ChainPrint } from "@/lib/crypto-price-chain";
import { loadPublicCryptoPrint } from "@/lib/crypto-price-feed";
import { publicCoinSourceLine } from "@/lib/data-sources";
import { getFxSnapshot } from "@/lib/fx";
import { pageTitle } from "@/lib/page-title";
import { isJunkCoin } from "@/lib/coin-junk";
import { withTimeout } from "@/lib/with-timeout";
import { cryptoDetailCopy, cryptoDetailJsonLd, vendorByCoingeckoId, type CryptoDetailFacts } from "@/lib/crypto-public-meta";
import { ensureCoinDepth } from "@/lib/crypto-depth.server";
import { CoinDepthFacts } from "@/components/markets/CoinDepthFacts";

export const dynamic = "force-dynamic";

const siteOrigin = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

/**
 * One read for the document title and the page.
 * NZD is included only when the FX snapshot was sourced. Market cap, volume,
 * supply and 1h/30d come from the depth record when the feed sent them.
 *
 * pull-check:retest4-2026-10-11
 */
const loadCryptoDetailFacts = cache(async (id: string): Promise<{ facts: CryptoDetailFacts; print: ChainPrint | null; initialDetail: CoinDetail | null }> => {
  const slug = resolvableCoinId(id) || decodeURIComponent(id).trim().toLowerCase();
  const vendor = vendorByCoingeckoId(slug);
  const coinId = resolvableCoinId(id);
  const depth = await withTimeout(() => ensureCoinDepth({ slug, budgetMs: 2_500 }), 3_500, null);
  const listed = depth && depth.price > 0 ? depth : null;
  const print =
    listed && listed.price > 0
      ? null
      : coinId
        ? await withTimeout(() => loadPublicCryptoPrint(coinId), 2500, null)
        : null;
  const priceUsd = listed && listed.price > 0 ? listed.price : print && print.price > 0 ? print.price : null;
  const priceSource = listed && listed.price > 0 ? listed.source || "" : print?.source || "";
  let priceNzd: number | null = null;
  let nzdSourced = false;
  if (priceUsd != null) {
    const fx = await withTimeout(() => getFxSnapshot(), 1500, null);
    const perUsd = fx?.ratesToNZD.USD ?? 0;
    if (fx?.sourced && perUsd > 0) {
      nzdSourced = true;
      priceNzd = priceUsd * perUsd;
    }
  }
  const marketCap = listed && listed.marketCap && listed.marketCap > 0 ? listed.marketCap : null;
  const snapshotPrint: ChainPrint | null =
    listed && listed.price > 0
      ? {
          symbol: listed.symbol,
          price: listed.price,
          changePct: listed.change24h,
          quotedAt: listed.quotedAt || listed.checkedAt || new Date(0).toISOString(),
          source: priceSource,
          stale: false,
          storedAt: Date.parse(listed.quotedAt || listed.checkedAt || "") || 0,
        }
      : null;
  const shown = snapshotPrint || (print && print.price > 0 ? print : null);
  return {
    print: shown,
    initialDetail: depth
      ? {
          ...depth,
          price: listed && listed.price > 0 ? listed.price : depth.price,
          source: priceSource || depth.source,
          sourceLine: publicCoinSourceLine(priceSource),
        }
      : null,
    facts: {
      slug,
      name: vendor?.name || depth?.name || null,
      symbol: vendor?.ticker || depth?.symbol || print?.symbol || null,
      priceUsd,
      priceNzd,
      nzdSourced,
      asOf: shown?.quotedAt || depth?.quotedAt || depth?.checkedAt || null,
      source: priceSource || depth?.source || null,
      marketCapUsd: marketCap,
    },
  };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (isJunkCoin(decodeURIComponent(id))) {
    return { title: pageTitle("Token not listed"), robots: { index: false, follow: false } };
  }
  const loaded = await loadCryptoDetailFacts(id);
  const copy = cryptoDetailCopy(loaded.facts);
  const meta = publicPageMetadata(`/markets/crypto/${id}`, copy);
  // H-3: a coin page with no price is not indexed.
  return loaded.facts.priceUsd == null ? { ...meta, robots: { index: false, follow: true } } : meta;
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
  if (isJunkCoin(decodeURIComponent(id))) {
    return (
      <MarketsAppFrame user={user}>
        <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6">
          <h1 className="font-display text-2xl font-bold text-foreground">This token is not listed</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            AetherForge AI does not list this token. See the crypto list on the Markets page for the coins we cover.
          </p>
          <a href="/markets" className="mt-6 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
            Go to Markets
          </a>
        </section>
      </MarketsAppFrame>
    );
  }
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
      {/* The coin view loads client-side only, so the page h1 is always printed here. */}
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {loaded.facts.name || (loaded.facts.symbol ? loaded.facts.symbol.toUpperCase() : decodeURIComponent(id))}
        </h1>
        {quotedLine ? (
          <p className="tnum mt-1 text-sm text-muted-foreground" data-server-price>{quotedLine}</p>
        ) : (
          <PublicCryptoPrices prints={[]} empty="No earlier price is stored for this coin." />
        )}
        <CoinDepthFacts detail={loaded.initialDetail} coinId={coinId} />
      </div>
      <CryptoAssetPage
        coinId={coinId}
        unavailable={!coinId}
        allowBuy={!!user && sp.buy === "1"}
        signedIn={!!user}
        openFromQuery={sp.buy === "1"}
        market={sp.market === "dex" ? "DEX" : "Crypto"}
        quotedLine={quotedLine || null}
        initialDetail={loaded.initialDetail}
        suppressDepth
      />
    </MarketsAppFrame>
  );
}
