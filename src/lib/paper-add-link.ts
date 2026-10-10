import { resolvableCoinId } from "@/lib/crypto-market";
import { unavailableCryptoHref } from "@/lib/market-detail-routes";

/** Where a paper-book add returns after sign-up. DEX rows keep the DEX badge. */
export type PaperAddTarget = {
  coinId?: string | null;
  symbol?: string | null;
  name?: string | null;
  market?: "Crypto" | "DEX" | null;
};

/**
 * Page the visitor should land on after they sign in, with buy=1 so the
 * member panel can open on that coin. A DEX row keeps market=dex.
 */
export function paperAddReturnPath(target: PaperAddTarget): string {
  const dex = target.market === "DEX";
  const coin = resolvableCoinId(target.coinId ?? null);
  if (coin) {
    const params = new URLSearchParams();
    params.set("buy", "1");
    if (dex) params.set("market", "dex");
    return `/markets/crypto/${encodeURIComponent(coin)}?${params.toString()}`;
  }
  const base = unavailableCryptoHref({
    symbol: target.symbol ?? undefined,
    name: target.name ?? undefined,
  });
  const split = base.indexOf("?");
  const path = split === -1 ? base : base.slice(0, split);
  const params = new URLSearchParams(split === -1 ? "" : base.slice(split + 1));
  params.set("buy", "1");
  if (dex) params.set("market", "dex");
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

/** Signed-out "Add to paper book" goes to sign-up and back to the same coin. */
export function paperAddSignupHref(target: PaperAddTarget): string {
  return `/register?redirect=${encodeURIComponent(paperAddReturnPath(target))}`;
}

/** Members open the record panel. Guests get the sign-up link instead. */
export function paperAddAction(
  signedIn: boolean,
  target: PaperAddTarget,
): { kind: "panel" } | { kind: "signup"; href: string } {
  if (signedIn) return { kind: "panel" };
  return { kind: "signup", href: paperAddSignupHref(target) };
}
