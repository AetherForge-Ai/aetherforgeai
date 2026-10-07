"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { searchAssets, type AssetHit, type AssetMarket } from "@/lib/asset-search";
import { PAPER_FEE_SUMMARY, suggestedFee } from "@/lib/fee-rule";
import { buildMovementPreview, type MovementPreview, type RecordKind } from "@/lib/movement-preview";
import { transactionProblems } from "@/lib/transaction-rules";
import {
  currencyForTicker,
  formatDisplayDate,
  formatMoneyWithNzd,
  formatNzd,
  formatPriceInput,
  formatSignedMoney,
  type CurrencyCode,
} from "@/lib/currency";
import { useFxRates } from "@/hooks/useFxRates";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { dexRowToCoin, type DexTokenRow } from "@/lib/crypto-dex";
import type { TxSeed } from "@/lib/transaction-dialog-store";
import { bumpHoldingsGeneration } from "@/lib/holdings-generation";
import { useTradeReviewGate } from "@/lib/trade-review-gate";
import { markDialogSearchGuard, noteDialogSearchQuery } from "@/lib/dialog-guards";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type BookHolding = {
  id: string;
  ticker: string;
  name: string;
  assetType: "stock" | "crypto" | "metal";
  quantity: number;
  price: number;
  purchaseDate?: string;
  metalSourceId?: string;
  coinId?: string;
};

const KINDS: { id: RecordKind; label: string }[] = [
  { id: "buy", label: "Buy" },
  { id: "sell", label: "Sell" },
  { id: "dividend", label: "Dividend" },
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
  { id: "tax", label: "Tax" },
  { id: "opening_balance", label: "Opening balance" },
];

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function dayOf(iso?: string | null): string {
  if (!iso) return "";
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return ymd ? ymd[1] : "";
}

function badgeClass(market: AssetMarket): string {
  if (market === "NZX") return "bg-sky-500/15 text-sky-700";
  if (market === "ASX") return "bg-amber-500/15 text-amber-700";
  if (market === "Crypto") return "bg-violet-500/15 text-violet-700";
  if (market === "DEX") return "bg-fuchsia-500/15 text-fuchsia-700";
  if (market === "Gold" || market === "Silver") return "bg-yellow-500/20 text-yellow-800";
  return "bg-muted text-muted-foreground";
}

export function RecordTransactionPanel({
  open,
  initialMode,
  holdings,
  cash,
  cashKnown,
  preferredAssetType,
  seed,
  onQueryChange,
  onDone,
  onRequestClose,
}: {
  open: boolean;
  initialMode: RecordKind;
  holdings: BookHolding[];
  cash: number;
  cashKnown: boolean;
  preferredAssetType?: "stock" | "crypto" | "metal" | null;
  seed?: TxSeed | null;
  onQueryChange?: (query: string) => void;
  onDone: (ledger: unknown) => void;
  onRequestClose: () => void;
}) {
  const today = useMemo(() => todayISO(), [open]);
  const { rates } = useFxRates();
  const { coins } = useCryptoMarkets(open);
  const [dex, setDex] = useState<AssetHit[]>([]);
  const [kind, setKind] = useState<RecordKind>(initialMode);
  const [query, setQuery] = useState("");
  const [shareHits, setShareHits] = useState<AssetHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [asset, setAsset] = useState<AssetHit | null>(null);
  const [date, setDate] = useState(today);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("NZD");
  const [fxRate, setFxRate] = useState("1");
  const [fee, setFee] = useState("0.00");
  const [feeDirty, setFeeDirty] = useState(false);
  const [priceDirty, setPriceDirty] = useState(false);
  const [fxDirty, setFxDirty] = useState(false);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [preview, setPreview] = useState<MovementPreview | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [book, setBook] = useState<BookHolding[]>(holdings);
  const [bookCash, setBookCash] = useState(cash);
  const [bookKnown, setBookKnown] = useState(cashKnown);
  const [firstBuys, setFirstBuys] = useState<Record<string, string>>({});
  const [metalId, setMetalId] = useState<string | undefined>(seed?.metalSourceId);
  const opened = useRef(false);
  const { beginReviewGuard, armReview, disarmReview, claimCommit, releaseCommit } = useTradeReviewGate();

  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    const nextKind = initialMode || "buy";
    setKind(nextKind);
    setStep("edit");
    setPreview(null);
    setProblems([]);
    setHint("");
    setQuery("");
    setNotes("");
    setFeeDirty(false);
    setPriceDirty(false);
    setFxDirty(false);
    setDate(today);
    const seeded = seedFrom(seed, preferredAssetType);
    setAsset(seeded);
    setMetalId(seed?.metalSourceId);
    setQuantity("");
    const startPrice = seed?.price && seed.price > 0 ? formatPriceInput(seed.price) : "";
    setPrice(startPrice);
    const cur = seeded ? currencyForTicker(seeded.symbol, seeded.assetType) : "NZD";
    setCurrency(cur);
    setFxRate(cur === "NZD" ? "1" : String(rates[cur] || 1));
    setFee(suggestedFee(nextKind, 0, Number(startPrice) || 0).toFixed(2));
    disarmReview();
  }, [open, initialMode, seed, preferredAssetType, today, rates, disarmReview]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void (async () => {
      const [tx, stocks, metals] = await Promise.all([
        api.get<{ cashBalance?: number; transactions?: Array<Record<string, unknown>> }>("/api/transactions"),
        api.get<Array<Record<string, unknown>>>("/api/stocks"),
        api.get<{ metals?: Array<Record<string, unknown>> }>("/api/metals"),
      ]);
      if (cancel) return;
      const rows: BookHolding[] = [];
      if (stocks.ok && Array.isArray(stocks.data)) {
        for (const row of stocks.data) rows.push(fromStock(row));
      }
      if (metals.ok && Array.isArray(metals.data?.metals)) {
        for (const row of metals.data.metals) rows.push(fromMetal(row));
      }
      if (rows.length) setBook(rows);
      else setBook(holdings);
      if (tx.ok && tx.data && typeof tx.data.cashBalance === "number") {
        setBookCash(tx.data.cashBalance);
        setBookKnown(true);
        const earliest: Record<string, string> = {};
        for (const row of tx.data.transactions || []) {
          if (String(row.type) !== "buy") continue;
          const ticker = String(row.ticker || "").toUpperCase();
          const day = dayOf(String(row.executed_at || ""));
          if (!ticker || !day) continue;
          if (!earliest[ticker] || day < earliest[ticker]) earliest[ticker] = day;
        }
        setFirstBuys(earliest);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, holdings]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    void api.get<DexTokenRow[]>("/api/crypto/dex").then((res) => {
      if (cancel || !res.ok || !Array.isArray(res.data)) return;
      setDex(
        res.data.map((row) => ({
          symbol: row.symbol,
          name: row.name || row.symbol,
          market: "DEX" as const,
          assetType: "crypto" as const,
          id: row.detailId || row.id,
          price: row.price,
        }))
      );
    });
    return () => {
      cancel = true;
    };
  }, [open]);

  useEffect(() => {
    noteDialogSearchQuery(query);
    onQueryChange?.(query);
    if (query.trim()) markDialogSearchGuard(30_000);
    const q = query.trim();
    if (q.length < 1) {
      setShareHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      void api
        .get<Array<{ symbol: string; name: string; exchangeLabel?: string }>>(`/api/tickers/search?q=${encodeURIComponent(q)}`)
        .then((res) => {
          if (!res.ok || !Array.isArray(res.data)) {
            setShareHits([]);
            return;
          }
          setShareHits(
            res.data.map((row) => ({
              symbol: row.symbol,
              name: row.name,
              market: marketForShare(row.exchangeLabel, row.symbol),
              assetType: "stock" as const,
            }))
          );
        })
        .finally(() => setSearching(false));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, onQueryChange]);

  const coinHits: AssetHit[] = useMemo(
    () =>
      coins.map((coin) => ({
        symbol: coin.symbol,
        name: coin.name,
        market: "Crypto" as const,
        assetType: "crypto" as const,
        id: coin.id,
        price: coin.price,
      })),
    [coins]
  );
  const heldHits = useMemo(
    () => book.filter((row) => row.quantity > 0).map(holdingHit),
    [book]
  );
  const results = useMemo(() => {
    const found = searchAssets(query, { shares: shareHits, coins: coinHits, dex });
    if (kind !== "dividend") return found;
    const owned = new Set(heldHits.map((hit) => hit.symbol.toUpperCase()));
    if (!query.trim()) return heldHits.slice(0, 12);
    return found.filter((hit) => owned.has(hit.symbol.toUpperCase()));
  }, [query, shareHits, coinHits, dex, kind, heldHits]);

  const held = useMemo(() => {
    if (!asset) return null;
    const sym = asset.symbol.toUpperCase();
    return (
      book.find((h) => h.metalSourceId && h.metalSourceId === metalId) ||
      book.find((h) => h.ticker.toUpperCase() === sym && h.assetType === asset.assetType) ||
      book.find((h) => h.ticker.toUpperCase() === sym) ||
      null
    );
  }, [asset, book, metalId]);

  const showAsset = kind === "buy" || kind === "sell" || kind === "dividend" || kind === "opening_balance";
  const showQty = kind === "buy" || kind === "sell" || (kind === "opening_balance" && !!asset);
  const cashMovement = !showQty;

  useEffect(() => {
    if (feeDirty) return;
    const next = suggestedFee(kind, Number(quantity) || 0, Number(price) || 0);
    setFee(next.toFixed(2));
  }, [kind, quantity, price, feeDirty]);

  useEffect(() => {
    if (!open || !asset || priceDirty) return;
    const sym = asset.symbol;
    const type = asset.assetType;
    let cancel = false;
    setHint(date === today ? "Fetching today's price…" : `Fetching the close for ${formatDisplayDate(date)}…`);
    void (async () => {
      if (date === today) {
        const id = asset.id ? `&id=${encodeURIComponent(asset.id)}` : "";
        const res = await api.get<{ price: number | null }>(
          `/api/tickers/quote?symbol=${encodeURIComponent(sym)}&type=${type}${id}`
        );
        if (cancel || priceDirty) return;
        if (res.ok && res.data?.price && res.data.price > 0) {
          setPrice(formatPriceInput(res.data.price));
          setHint("Today's price is filled in. You can type over it.");
        } else if (asset.price && asset.price > 0) {
          setPrice(formatPriceInput(asset.price));
          setHint("Live price was unavailable. A recent print is filled in. You can type over it.");
        } else {
          setHint("No price came back. Type the price you want to record.");
        }
      } else {
        const res = await api.get<{ price: number | null; currency?: CurrencyCode; fxRate?: number }>(
          `/api/tickers/history?symbol=${encodeURIComponent(sym)}&type=${type}&date=${date}`
        );
        if (cancel || priceDirty) return;
        if (res.ok && res.data?.price && res.data.price > 0) {
          setPrice(formatPriceInput(res.data.price));
          if (!fxDirty && res.data.fxRate && res.data.fxRate > 0) setFxRate(String(res.data.fxRate));
          if (res.data.currency) setCurrency(res.data.currency);
          setHint(`Suggested close for ${formatDisplayDate(date)}. You can type over the price and the exchange rate.`);
        } else {
          setHint(`No close was found for ${formatDisplayDate(date)}. Type the price you paid.`);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, asset, date, today, priceDirty, fxDirty]);

  function chooseAsset(hit: AssetHit) {
    setAsset(hit);
    setQuery("");
    setPriceDirty(false);
    setFxDirty(false);
    const cur = currencyForTicker(hit.symbol, hit.assetType);
    setCurrency(cur);
    if (!fxDirty) setFxRate(cur === "NZD" ? "1" : String(rates[cur] || 1));
    const match = book.find((h) => h.ticker.toUpperCase() === hit.symbol.toUpperCase());
    setMetalId(match?.metalSourceId);
    if (kind === "sell" && match && !(Number(quantity) > 0)) setQuantity(String(match.quantity));
  }

  function buildPreview(): MovementPreview {
    const fx = currency === "NZD" ? 1 : Number(fxRate) || rates[currency] || 1;
    return buildMovementPreview({
      type: kind,
      date,
      asset: asset?.symbol,
      assetName: asset?.name,
      quantity: Number(quantity) || 0,
      price: Number(price) || 0,
      fee: Number(fee) || 0,
      currency: cashMovement ? "NZD" : currency,
      fxRate: fx,
      cashNzd: bookKnown ? bookCash : cash,
      hasAsset: !!asset,
    });
  }

  function review() {
    if (!beginReviewGuard() || saving) return;
    const next = buildPreview();
    const first = asset
      ? earliest(firstBuys[asset.symbol.toUpperCase()], held?.purchaseDate)
      : "";
    const messages = transactionProblems({
      type: kind,
      date,
      today,
      quantity: Number(quantity) || 0,
      price: Number(price) || 0,
      held: held?.quantity || 0,
      firstBuyDate: first || null,
      hasAsset: !!asset,
      cashKnown: bookKnown || cashKnown,
      cashAfterNzd: next.cashAfterNzd,
      cashChangeNzd: next.cashChangeNzd,
      needsCash: next.cashChangeNzd < -1e-6 || kind === "buy" || kind === "withdraw" || kind === "tax",
    });
    setProblems(messages);
    if (messages.length) return;
    setPreview(next);
    armReview();
    setStep("review");
  }

  async function confirm() {
    if (step !== "review" || !preview || saving || !claimCommit()) return;
    setSaving(true);
    try {
      if (kind === "sell" && (metalId || held?.metalSourceId)) {
        const id = metalId || held?.metalSourceId;
        const params = new URLSearchParams({
          ounces: String(preview.quantity),
          confirm: "true",
          price: String(preview.priceNzd),
          fees: String(preview.feeNzd),
          date: preview.date,
        });
        const url = `/api/metals/${id}?${params.toString()}`;
        const res = await api.delete(url, { confirm: true });
        if (!res.ok) {
          toast.error(typeof res.error === "string" ? res.error : "Could not record that sale.");
          return;
        }
        bumpHoldingsGeneration();
        toast.success("Sale recorded");
        const ledger = await api.get("/api/transactions");
        onDone(ledger.data);
        onRequestClose();
        return;
      }
      const payload: Record<string, unknown> = {
        type: kind,
        notes: notes.trim() || undefined,
        executed_at: date,
        fees: Number(fee) || 0,
      };
      if (showQty && asset) {
        payload.ticker = asset.symbol.toUpperCase();
        payload.asset_type = asset.assetType;
        payload.asset_name = asset.name;
        payload.quantity = Number(quantity);
        payload.price = Number(price);
        payload.fx_rate = Number(fxRate) || undefined;
        payload.confirm = true;
        if (asset.id && asset.assetType === "crypto") payload.coingecko_id = asset.id;
      } else {
        payload.amount = Number(price);
        if (kind === "dividend" && asset) {
          payload.ticker = asset.symbol.toUpperCase();
          payload.asset_type = asset.assetType;
          payload.asset_name = asset.name;
        }
        if (kind === "opening_balance" && asset) {
          payload.ticker = asset.symbol.toUpperCase();
          payload.asset_type = asset.assetType;
          payload.asset_name = asset.name;
          payload.quantity = Number(quantity);
          payload.price = Number(price);
          payload.confirm = true;
          delete payload.amount;
        }
      }
      const res = await api.post("/api/transactions", payload);
      if (!res.ok) {
        toast.error(typeof res.error === "string" ? res.error : "Could not record that transaction.");
        return;
      }
      if (showQty) bumpHoldingsGeneration();
      toast.success("Transaction recorded");
      onDone(res.data);
      onRequestClose();
    } finally {
      setSaving(false);
      releaseCommit();
    }
  }

  const livePreview = step === "edit" ? buildPreview() : preview;

  return (
    <div data-testid="record-transaction-panel">
      {step === "review" && preview ? (
        <div className="space-y-3" data-testid="record-review">
          <div>
            <p className="font-display text-base font-bold">Review</p>
            <p className="text-xs text-muted-foreground">Nothing is written until you confirm.</p>
          </div>
          <ReviewRow label="Type" value={KINDS.find((k) => k.id === preview.type)?.label || preview.type} />
          {preview.asset ? <ReviewRow label="Asset" value={preview.assetName && preview.assetName !== preview.asset ? `${preview.asset} · ${preview.assetName}` : preview.asset} /> : null}
          <ReviewRow label="Date" value={formatDisplayDate(preview.date)} />
          {showQty ? <ReviewRow label="Quantity" value={String(preview.quantity)} /> : null}
          <ReviewRow
            label={showQty ? "Price" : "Amount"}
            value={formatMoneyWithNzd(preview.priceNative, preview.currency, preview.priceNzd)}
          />
          <ReviewRow label="Exchange rate" value={preview.fxRate === 1 ? "1 NZD" : `${trimRate(preview.fxRate)} NZD per 1 ${preview.currency}`} />
          <ReviewRow label="Fee" value={formatMoneyWithNzd(preview.feeNative, preview.currency, preview.feeNzd)} />
          <ReviewRow label="Cash change" value={formatSignedMoney(preview.cashChangeNzd)} />
          <ReviewRow label="Cash after" value={formatNzd(preview.cashAfterNzd)} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="flex flex-wrap gap-1.5" data-testid="record-types" role="group" aria-label="Transaction type">
              {KINDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setKind(item.id);
                    setProblems([]);
                    setStep("edit");
                    if (item.id === "dividend") setQuery("");
                  }}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
                    kind === item.id ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"
                  )}
                  aria-pressed={kind === item.id}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {showAsset ? (
            <div className="space-y-2">
              <Label htmlFor="record-search">Asset</Label>
              {asset ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">
                    {asset.symbol}
                    <span className="ml-2 font-normal text-muted-foreground">{asset.name}</span>
                  </span>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase", badgeClass(asset.market))}>
                    {asset.market}
                  </span>
                  <button type="button" className="text-xs font-semibold text-primary" onClick={() => setAsset(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    id="record-search"
                    data-testid="record-search"
                    value={query}
                    placeholder={
                      kind === "dividend"
                        ? "Search a holding you already have"
                        : kind === "opening_balance"
                          ? "Search a share, coin, gold or silver — or leave empty for opening cash"
                          : "Search shares, coins, DEX tokens, gold or silver"
                    }
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                  />
                  {kind === "dividend" || query.trim() ? (
                    <ul className="max-h-48 overflow-auto rounded-lg border border-border/70" data-testid="record-results">
                      {searching && results.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
                      ) : results.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-muted-foreground">
                          {kind === "dividend" ? "No holding matches that search." : "Nothing matches that search."}
                        </li>
                      ) : (
                        results.map((hit) => (
                          <li key={`${hit.market}-${hit.symbol}-${hit.id || ""}`}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                              onClick={() => chooseAsset(hit)}
                            >
                              <span className="min-w-0 truncate">
                                <span className="font-semibold">{hit.symbol}</span>
                                <span className="ml-2 text-muted-foreground">{hit.name}</span>
                              </span>
                              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase", badgeClass(hit.market))}>
                                {hit.market}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      One box covers NZX and ASX shares, the CoinGecko coin list, DEX tokens, gold and silver.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="record-date">Date</Label>
              <div className="relative">
                <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm">{formatDisplayDate(date)}</div>
                <input
                  id="record-date"
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPriceDirty(false);
                    setFxDirty(false);
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label={`Date ${formatDisplayDate(date)}`}
                />
              </div>
            </div>
            {showQty ? (
              <div className="space-y-1.5">
                <Label htmlFor="record-qty">{asset?.assetType === "metal" ? "Ounces" : "Quantity"}</Label>
                <Input
                  id="record-qty"
                  inputMode="decimal"
                  value={quantity}
                  placeholder={asset?.assetType === "metal" ? "Ounces, for example 0.5" : "How many units"}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="record-amount">Amount (NZ$)</Label>
                <Input
                  id="record-amount"
                  inputMode="decimal"
                  value={price}
                  placeholder="Amount in NZ dollars"
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceDirty(true);
                  }}
                />
              </div>
            )}
            {showQty ? (
              <div className="space-y-1.5">
                <Label htmlFor="record-price">Price</Label>
                <Input
                  id="record-price"
                  inputMode="decimal"
                  value={price}
                  placeholder="Price per unit"
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceDirty(true);
                  }}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="record-ccy">Currency</Label>
              <select
                id="record-ccy"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={cashMovement ? "NZD" : currency}
                disabled={cashMovement}
                onChange={(e) => {
                  const next = e.target.value as CurrencyCode;
                  setCurrency(next);
                  if (!fxDirty) setFxRate(next === "NZD" ? "1" : String(rates[next] || 1));
                }}
              >
                <option value="NZD">NZD</option>
                <option value="AUD">AUD</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="record-fx">Exchange rate (NZD per 1)</Label>
              <Input
                id="record-fx"
                inputMode="decimal"
                value={cashMovement ? "1" : fxRate}
                onChange={(e) => {
                  setFxRate(e.target.value);
                  setFxDirty(true);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="record-fee">Fee</Label>
              <Input
                id="record-fee"
                inputMode="decimal"
                value={fee}
                placeholder="0.00"
                onChange={(e) => {
                  setFee(e.target.value);
                  setFeeDirty(true);
                }}
              />
              <p className="text-[0.7rem] text-muted-foreground">Shown even at zero. Type over it with your broker's fee.</p>
            </div>
          </div>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          <div className="space-y-1.5">
            <Label htmlFor="record-notes">Notes</Label>
            <Input id="record-notes" value={notes} placeholder="Optional note for the ledger" onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {PAPER_FEE_SUMMARY}{" "}
            <Link href="/trust" className="font-semibold text-primary underline-offset-2 hover:underline">
              How the books work
            </Link>
          </p>
          {livePreview ? (
            <p className="text-sm">
              Cash change{" "}
              <span className={cn("tnum font-semibold", livePreview.cashChangeNzd < 0 ? "text-rose-600" : "text-emerald-700")}>
                {formatSignedMoney(livePreview.cashChangeNzd)}
              </span>
              <span className="text-muted-foreground"> · cash after {bookKnown || cashKnown ? formatNzd(livePreview.cashAfterNzd) : "still loading"}</span>
            </p>
          ) : null}
          {problems.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700" role="alert">
              {problems.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onRequestClose} disabled={saving}>
          Cancel
        </Button>
        {step === "review" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              disarmReview();
              setStep("edit");
            }}
          >
            Back
          </Button>
        ) : null}
        {step === "review" ? (
          <Button type="button" className="font-semibold" onClick={() => void confirm()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Confirm
          </Button>
        ) : (
          <Button type="button" className="font-semibold" onClick={review}>
            Review
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum text-right font-medium">{value}</span>
    </div>
  );
}

function trimRate(n: number): string {
  return (Math.round(n * 10000) / 10000).toString();
}

function earliest(a?: string, b?: string | null): string {
  const left = dayOf(a);
  const right = dayOf(b);
  if (left && right) return left < right ? left : right;
  return left || right || "";
}

function holdingHit(row: BookHolding): AssetHit {
  const market: AssetMarket =
    row.assetType === "metal"
      ? row.ticker.toUpperCase() === "SILVER"
        ? "Silver"
        : "Gold"
      : row.assetType === "crypto"
        ? "Crypto"
        : marketForShare("", row.ticker);
  return {
    symbol: row.ticker,
    name: row.name,
    market,
    assetType: row.assetType,
    id: row.coinId,
    price: row.price,
  };
}

function marketForShare(label: string | undefined, symbol: string): AssetMarket {
  const text = `${label || ""} ${symbol}`.toUpperCase();
  if (text.includes("NZX") || symbol.toUpperCase().endsWith(".NZ")) return "NZX";
  if (text.includes("ASX") || symbol.toUpperCase().endsWith(".AX")) return "ASX";
  return "US";
}

function seedFrom(seed: TxSeed | null | undefined, preferred?: "stock" | "crypto" | "metal" | null): AssetHit | null {
  if (seed?.ticker) {
    const assetType = seed.assetType || "stock";
    const market: AssetMarket =
      assetType === "metal"
        ? seed.ticker.toUpperCase() === "SILVER"
          ? "Silver"
          : "Gold"
        : assetType === "crypto"
          ? "Crypto"
          : marketForShare("", seed.ticker);
    return { symbol: seed.ticker.toUpperCase(), name: seed.name || seed.ticker, market, assetType, id: seed.coinId, price: seed.price };
  }
  if (preferred === "metal") return { symbol: "GOLD", name: "Gold", market: "Gold", assetType: "metal" };
  return null;
}

function fromStock(row: Record<string, unknown>): BookHolding {
  const ticker = String(row.ticker || "").toUpperCase();
  const assetType = (row.asset_type as BookHolding["assetType"]) || "stock";
  return {
    id: String(row._id || ticker),
    ticker,
    name: String(row.company_name || ticker),
    assetType,
    quantity: Number(row.shares) || 0,
    price: Number(row.current_price) || Number(row.purchase_price) || 0,
    purchaseDate: typeof row.purchase_date === "string" ? row.purchase_date : undefined,
  };
}

function fromMetal(row: Record<string, unknown>): BookHolding {
  const metal = String(row.metal || "").toLowerCase();
  const ticker = metal === "silver" ? "SILVER" : "GOLD";
  return {
    id: String(row._id || ticker),
    ticker,
    name: metal === "silver" ? "Silver" : "Gold",
    assetType: "metal",
    quantity: Number(row.ounces) || 0,
    price: Number(row.purchase_price_per_oz) || 0,
    metalSourceId: String(row._id || ""),
  };
}

/** Map a dashboard holding into the shape the panel understands. */
export function bookHoldingFromStock(row: {
  _id?: string;
  ticker: string;
  company_name?: string;
  asset_type?: string | null;
  shares?: number;
  current_price?: number;
  purchase_price?: number;
  purchase_date?: string | null;
  metalSourceId?: string;
}): BookHolding {
  return fromStock({
    _id: row._id,
    ticker: row.ticker,
    company_name: row.company_name,
    asset_type: row.asset_type || (row.metalSourceId ? "metal" : "stock"),
    shares: row.shares,
    current_price: row.current_price,
    purchase_price: row.purchase_price,
    purchase_date: row.purchase_date,
  });
}
