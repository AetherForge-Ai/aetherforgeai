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
import { publicCoinSourceLine } from "@/lib/data-sources";
import { peekTop400 } from "@/lib/crypto-coingecko";
import { readCryptoSnapshot } from "@/lib/crypto-snapshot";
import { getFxSnapshot } from "@/lib/fx";
import { pageTitle } from "@/lib/page-title";
import { presentMarketCoin } from "@/lib/crypto-api-body";
import { presentListedCoin } from "@/lib/crypto-board";
import { detailFromMarket, fmtCompactNum, fmtPct, fmtPrice, stalePriceReason } from "@/lib/crypto-market";
import { formatDisplayDateTime } from "@/lib/currency";
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
const loadCryptoDetailFacts = cache(async (id: string): Promise<{ facts: CryptoDetailFacts; print: ChainPrint | null; initialDetail: ReturnType<typeof detailFromMarket> | null }> => {
  const slug = resolvableCoinId(id) || decodeURIComponent(id).trim().toLowerCase();
  const vendor = vendorByCoingeckoId(slug);
  const coinId = resolvableCoinId(id);
  const saved = await readCryptoSnapshot();
  const listed =
    peekTop400()?.coins.find((coin) => coin.id === slug || coin.symbol.toUpperCase() === (vendor?.ticker || "")) ??
    saved?.coins.find((coin) => coin.id === slug || coin.symbol.toUpperCase() === (vendor?.ticker || "")) ??
    null;
  const print =
    listed && listed.price > 0
      ? null
      : coinId
        ? await loadPublicCryptoPrint(coinId)
        : null;
  const priceUsd = listed && listed.price > 0 ? listed.price : print && print.price > 0 ? print.price : null;
  const priceSource = listed && listed.price > 0 ? listed.source || "" : print?.source || "";
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
  const snapshotPrint: ChainPrint | null =
    listed && listed.price > 0
      ? {
          symbol: listed.symbol,
          price: listed.price,
          changePct: listed.change24h,
          quotedAt: listed.quotedAt || saved?.at || new Date(0).toISOString(),
          source: priceSource,
          stale: false,
          storedAt: Date.parse(listed.quotedAt || saved?.at || "") || 0,
        }
      : null;
  const shown = snapshotPrint || (print && print.price > 0 ? print : null);
  const listedDetail = listed ? detailFromMarket(presentMarketCoin(presentListedCoin(listed))) : null;
  return {
    print: shown,
    initialDetail: listedDetail
      ? {
          ...listedDetail,
          price: listed && listed.price > 0 ? listed.price : listedDetail.price,
          source: priceSource,
          sourceLine: publicCoinSourceLine(priceSource),
        }
      : null,
    facts: {
      slug,
      name: vendor?.name || listed?.name || null,
      symbol: vendor?.ticker || listed?.symbol || print?.symbol || null,
      priceUsd,
      priceNzd,
      nzdSourced,
      asOf: shown?.quotedAt || listed?.quotedAt || saved?.at || null,
      source: priceSource || null,
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
        <p className="text-sm leading-relaxed text-muted-foreground" data-coin-description>
          {copy.description}
        </p>
        {loaded.initialDetail ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-coin-snapshot>
            <div>
              <dt className="text-xs text-muted-foreground">Price</dt>
              <dd className="font-semibold">
                {stalePriceReason(loaded.initialDetail.quotedAt || loaded.facts.asOf) ||
                  fmtPrice(loaded.initialDetail.price)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">As at</dt>
              <dd>{formatDisplayDateTime(loaded.initialDetail.quotedAt || loaded.facts.asOf)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">1h</dt>
              <dd>{fmtPct(loaded.initialDetail.change1h)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">7d</dt>
              <dd>{fmtPct(loaded.initialDetail.change7d)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">24h</dt>
              <dd>{fmtPct(loaded.initialDetail.change24h)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Circulating</dt>
              <dd>{fmtCompactNum(loaded.initialDetail.circulatingSupply)}</dd>
            </div>
          </dl>
        ) : (
          <PublicCryptoPrices
            prints={print && print.price > 0 ? [print] : []}
            empty={`${decodeURIComponent(id)} No earlier price is stored for this coin.`}
          />
        )}
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
      />
    </MarketsAppFrame>
  );
}
