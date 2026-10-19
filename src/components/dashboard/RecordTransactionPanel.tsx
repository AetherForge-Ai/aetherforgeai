"use client";

import { noteWrite, WRITE_TIMEOUT_CODE, WRITE_TIMEOUT_MESSAGE, WRITE_TIMEOUT_MS, clearCancelledWriteKey, clearPendingWrite, isCancelledWriteKey, isDefiniteRefusal, journalPendingWrite, newWriteKey, withWriteTimeout } from "@/lib/write-journal";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { dexSearchHits, searchAssets, type AssetHit, type AssetMarket } from "@/lib/asset-search";
import { cleanChain, dexFromHolding, isDexSource } from "@/lib/dex-source";
import { useRestoreScroll } from "@/components/dashboard/use-restore-scroll";
import { shownTradePriceLabel, tradePriceHint, type TradePriceSession } from "@/lib/trade-price-label";
import { PAPER_FEE_SUMMARY, suggestedFee } from "@/lib/fee-rule";
import { buildMovementPreview, movementNzdTotal, type MovementPreview, type RecordKind } from "@/lib/movement-preview";
import { transactionProblems } from "@/lib/transaction-rules";
import { distributionLabel } from "@/lib/income-label";
import {
  currencyForTicker,
  formatDisplayDate,
  formatFxInput,
  formatMoneyWithNzd,
  formatNzd,
  formatPriceInput,
  formatQuantity,
  formatSignedMoney,
  type CurrencyCode,
} from "@/lib/currency";
import { aucklandYmd } from "@/lib/entitlements";
import { executedAtForLedger } from "@/lib/executed-at";
import { openingFx } from "@/lib/reviewed-book";
import { useFxRates } from "@/hooks/useFxRates";
import { useCryptoMarkets } from "@/hooks/useCryptoMarkets";
import { dexRowToCoin, type DexTokenRow } from "@/lib/crypto-dex";
import type { TxSeed } from "@/lib/transaction-dialog-store";
import { bumpHoldingsGeneration } from "@/lib/holdings-generation";
import { useTradeReviewGate } from "@/lib/trade-review-gate";
import { DUPLICATE_DIVIDEND_CODE, findDuplicateDividendTx, type DividendTxLike } from "@/lib/dividend-ledger";

function duplicateDividendMessage(ticker: string): string {
  return `A ${ticker.toUpperCase()} dividend for this date and amount is already recorded. Save anyway, or cancel.`;
}
import { markDialogSearchGuard, noteDialogSearchQuery } from "@/lib/dialog-guards";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getActiveAccountUserId } from "@/lib/account-identity";

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
  venue?: string | null;
  chain?: string | null;
  /** DEX fills store `DEX · <Chain>` here. There is no venue column. */
  sector?: string | null;
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

/** Auckland calendar day, so a correction dated today is allowed while UTC is still yesterday. */
/** b31 G-10: how long Confirm holds the dialog for the server before finishing in the background. */
// b32 G-10: the dialog closes by 0.9 s; the book keeps a "Saving…" state until the server acknowledges.
const CONFIRM_HOLD_MS = 900;
/** Smallest plan holding cap (Free, 10). Below cap − 1 distinct holdings a new sleeve cannot hit any cap. */
const MIN_PLAN_HOLDING_CAP = 10;

/** b32 G-10: a save is acknowledged only when the server returns the saved row's id. */
export function acknowledgedId(res: { ok: boolean; data?: unknown }): string | null {
  if (!res.ok) return null;
  const id = (res.data as { lastTransaction?: { _id?: unknown } } | undefined)?.lastTransaction?._id;
  return typeof id === "string" && id && !id.startsWith("optimistic-") ? id : null;
}
/** b37 G-10: the server's 409 "account-mismatch" (the session switched accounts) in plain words. */
export const SESSION_SWITCHED_ERROR =
  "Not recorded: this browser is now signed in to a different account. Nothing was saved. Reload, check the account, then try again.";
function writeError(error: unknown, fallback: string): string {
  if (error === "account-mismatch") return SESSION_SWITCHED_ERROR;
  return typeof error === "string" ? error : fallback;
}
const NOT_ACKNOWLEDGED = "The server did not confirm the save, so nothing is shown as saved. Check your connection and try again.";

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayISO(): string {
  return aucklandYmd();
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
  onSavingChange,
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
  /** b40 G-10: tells the dialog a confirmed write is in flight, so X and Escape can't close it. */
  onSavingChange?: (saving: boolean) => void;
}) {
  const today = useMemo(() => todayISO(), [open]);
  const { rates, live: fxLive } = useFxRates();
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
  const [fxRate, setFxRate] = useState("");
  const [fee, setFee] = useState("0.00");
  const [feeDirty, setFeeDirty] = useState(false);
  const [priceDirty, setPriceDirty] = useState(false);
  const [quoteOrigin, setQuoteOrigin] = useState<"" | "snapshot">("");
  const [priceAsAt, setPriceAsAt] = useState("");
  const [priceSession, setPriceSession] = useState<TradePriceSession>("");
  const [quoteChain, setQuoteChain] = useState("");
  const [fxDirty, setFxDirty] = useState(false);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [preview, setPreview] = useState<MovementPreview | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  // b39 G-10: warn before leaving while a confirmed write is in flight (TT reloaded 0.4-4.3 s after Confirm).
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);
  useEffect(() => {
    if (!saving) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  const [checkingCash, setCheckingCash] = useState(false);
  const [cashNote, setCashNote] = useState("");
  const [saveError, setSaveError] = useState("");
  // b7 H-5: duplicate dividend warning shown at Review; Confirm needs an explicit tick.
  const [dupWarning, setDupWarning] = useState("");
  const [dupAck, setDupAck] = useState(false);
  const [book, setBook] = useState<BookHolding[]>(holdings);
  const [bookCash, setBookCash] = useState(cash);
  const [bookKnown, setBookKnown] = useState(cashKnown);
  const [firstBuys, setFirstBuys] = useState<Record<string, string>>({});
  const [metalId, setMetalId] = useState<string | undefined>(seed?.metalSourceId);
  const opened = useRef(false);
  const reviewKey = useRef("");
  const { beginReviewGuard, armReview, disarmReview, claimCommit, releaseCommit, confirmReady } = useTradeReviewGate();
  useRestoreScroll(open);

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
    setPriceSession("");
    setSaveError("");
    setDupWarning("");
    setDupAck(false);
    setQuery("");
    setNotes("");
    setFeeDirty(false);
    setPriceDirty(false);
    setQuoteOrigin("");
    setPriceAsAt("");
    setQuoteChain("");
    setFxDirty(false);
    setDate(today);
    const seeded = seedFrom(seed, preferredAssetType);
    const cashKind = isCashKind(nextKind);
    setAsset(cashKind ? null : seeded);
    setMetalId(cashKind ? undefined : seed?.metalSourceId);
    setQuantity("");
    const startPrice = cashKind || !(seed?.price && seed.price > 0) ? "" : formatPriceInput(seed.price);
    setPrice(startPrice);
    const cur = cashKind || !seeded ? "NZD" : currencyForTicker(seeded.symbol, seeded.assetType);
    setCurrency(cur);
    const seededDay = dayOf(seed?.purchaseDate);
    if (nextKind === "correction" && seededDay) setDate(seededDay);
    if (seed?.quantity && seed.quantity > 0) setQuantity(String(seed.quantity));
    if (nextKind === "correction") setPriceDirty(true);
    setFxRate(openingFx({ currency: cur, live: fxLive, liveRate: rates[cur] }) || "");
    setFee(suggestedFee(nextKind, 0, Number(startPrice) || 0).toFixed(2));
    disarmReview();
  }, [open, initialMode, seed, preferredAssetType, today, rates, fxLive, disarmReview]);

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
      setDex(dexSearchHits(res.data));
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
    if (kind === "sell") {
      const q = query.trim().toLowerCase();
      const owned = heldHits.filter((hit) => {
        if (!q) return true;
        return `${hit.symbol} ${hit.name}`.toLowerCase().includes(q);
      });
      return owned.slice(0, 12);
    }
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

  const showAsset = kind === "buy" || kind === "sell" || kind === "dividend" || kind === "opening_balance" || kind === "correction";
  const showQty = kind === "buy" || kind === "sell" || kind === "correction" || (kind === "opening_balance" && !!asset);
  const cashMovement = !showQty;

  useEffect(() => {
    if (feeDirty) return;
    const next = suggestedFee(kind, Number(quantity) || 0, Number(price) || 0);
    setFee(next.toFixed(2));
  }, [kind, quantity, price, feeDirty]);

  useEffect(() => {
    if (!open || fxDirty || step === "review") return;
    const seededDay = dayOf(seed?.purchaseDate);
    if (initialMode === "correction" && seededDay && seededDay !== today) return;
    if (kind === "correction" && date !== today) return;
    if (date !== today) return;
    const next = openingFx({ currency, live: fxLive, liveRate: rates[currency] });
    if (next) setFxRate(next);
  }, [open, fxDirty, date, today, currency, fxLive, rates, step, kind, initialMode, seed]);

  useEffect(() => {
    if (!open || !asset || step === "review") return;
    if (kind === "correction" && date === today) return;
    if (kind !== "correction" && priceDirty) return;
    const sym = asset.symbol;
    const type = asset.assetType;
    let cancel = false;
    const fetchingClose = date !== today;
    if (kind === "correction" && fetchingClose && !fxDirty) setFxRate("");
    setHint(date === today ? "Fetching the price…" : `Fetching the close for ${formatDisplayDate(date)}…`);
    void (async () => {
      if (date === today) {
        const id = asset.id ? `&id=${encodeURIComponent(asset.id)}` : "";
        const market = asset.market === "DEX" ? "&market=dex" : "";
        const res = await api.get<{
          price: number | null;
          label?: string | null;
          source?: string | null;
          quotedAt?: string | null;
          session?: "open" | "closed" | null;
          chain?: string | null;
        }>(
          `/api/tickers/quote?symbol=${encodeURIComponent(sym)}&type=${type}${id}${market}`
        );
        if (cancel || priceDirty) return;
        if (res.ok && res.data?.price && res.data.price > 0) {
          setPrice(formatPriceInput(res.data.price));
          const session: TradePriceSession = res.data.session === "open" || res.data.session === "closed" ? res.data.session : "";
          setPriceSession(session);
          setPriceAsAt(res.data.quotedAt || "");
          setHint(
            session
              ? tradePriceHint({ priceDirty: false, session, quotedAt: res.data.quotedAt || "" })
              : res.data.label || ""
          );
          if (res.data.source === "snapshot") {
            setQuoteOrigin("snapshot");
            setQuoteChain(res.data.chain || "");
          } else {
            setQuoteOrigin("");
            setQuoteChain("");
          }
        } else if (asset.price && asset.price > 0) {
          setPrice(formatPriceInput(asset.price));
          setHint(res.data?.label || "Live price was unavailable. A recent print is filled in. You can type over it.");
        } else if (res.data?.label) {
          setHint(res.data.label);
        } else {
          setHint("No price came back. Type the price you want to record.");
        }
      } else {
        const res = await api.get<{ price: number | null; currency?: CurrencyCode; fxRate?: number }>(
          `/api/tickers/history?symbol=${encodeURIComponent(sym)}&type=${type}&date=${date}`
        );
        if (cancel || (kind !== "correction" && priceDirty)) return;
        if (res.ok && res.data?.price && res.data.price > 0 && kind !== "correction") {
          setPrice(formatPriceInput(res.data.price));
          if (!fxDirty && res.data.fxRate && res.data.fxRate > 0) setFxRate(formatFxInput(res.data.fxRate));
          if (res.data.currency) setCurrency(res.data.currency);
          setHint(`Suggested close for ${formatDisplayDate(date)}. You can type over the price and the exchange rate.`);
        } else if (res.ok && kind === "correction") {
          if (!fxDirty && res.data?.fxRate && res.data.fxRate > 0) setFxRate(formatFxInput(res.data.fxRate));
          setHint("The purchase price stays as recorded. You can type over the exchange rate.");
        } else {
          setHint(`No close was found for ${formatDisplayDate(date)}. Type the price you paid.`);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, asset, date, today, priceDirty, fxDirty, step, kind]);

  function chooseAsset(hit: AssetHit) {
    setAsset(hit);
    setQuery("");
    setPriceDirty(false);
    setQuoteOrigin("");
    setPriceAsAt("");
    setPriceSession("");
    setHint("");
    setQuoteChain("");
    setFxDirty(false);
    const cur = currencyForTicker(hit.symbol, hit.assetType);
    setCurrency(cur);
    if (date === today) {
      setFxRate(openingFx({ currency: cur, live: fxLive, liveRate: rates[cur] }) || "");
    }
    if (hit.market === "DEX" && hit.price && hit.price > 0) setPrice(formatPriceInput(hit.price));
    const match = book.find((h) => h.ticker.toUpperCase() === hit.symbol.toUpperCase());
    setMetalId(match?.metalSourceId);
    if (kind === "sell" && match && !(Number(quantity) > 0)) setQuantity(String(match.quantity));
  }

  function buildPreview(cashBalance?: number): MovementPreview {
    const parsedFx = Number(fxRate);
    const fx = currency === "NZD" ? 1 : parsedFx > 0 ? parsedFx : 0;
    const cashOnly = isCashKind(kind);
    return buildMovementPreview({
      type: kind,
      date,
      asset: cashOnly ? undefined : asset?.symbol,
      assetName: cashOnly ? undefined : asset?.name,
      quantity: cashOnly ? 0 : Number(quantity) || 0,
      price: Number(price) || 0,
      fee: Number(fee) || 0,
      currency: cashOnly || cashMovement ? "NZD" : currency,
      fxRate: fx,
      cashNzd: cashBalance != null ? cashBalance : bookKnown ? bookCash : cash,
      hasAsset: cashOnly ? false : !!asset,
    });
  }

  // Clear a stale "Enter a price" problem once a price arrives (typed or auto-filled).
  useEffect(() => {
    if (Number(price) > 0) {
      setProblems((prev) => (prev.includes("Enter a price to review this trade.") ? prev.filter((p) => p !== "Enter a price to review this trade.") : prev));
    }
  }, [price]);

  async function review() {
    if (!beginReviewGuard() || saving || checkingCash) return;
    if ((kind === "buy" || kind === "sell") && showQty && !(Number(price) > 0)) {
      setProblems(["Enter a price to review this trade."]);
      return;
    }
    if ((kind === "buy" || kind === "sell") && currency !== "NZD" && !(Number(fxRate) > 0)) {
      setProblems(["The exchange rate is still loading. Wait for today's rate, or type the one from your broker."]);
      return;
    }
    let known = bookKnown || cashKnown;
    let balance = known ? (bookKnown ? bookCash : cash) : cash;
    if (!known) {
      setCheckingCash(true);
      try {
        const tx = await api.get<{ cashBalance?: number }>("/api/transactions");
        if (tx.ok && tx.data && typeof tx.data.cashBalance === "number") {
          balance = tx.data.cashBalance;
          known = true;
          setBookCash(balance);
          setBookKnown(true);
        }
      } finally {
        setCheckingCash(false);
      }
    }
    const next = buildPreview(known ? balance : undefined);
    const first = asset
      ? earliest(firstBuys[asset.symbol.toUpperCase()], held?.purchaseDate)
      : "";
    const messages = transactionProblems({
      type: kind,
      date,
      today,
      quantity: Number(quantity) || 0,
      price: Number(price) || 0,
      quantityRaw: showQty ? quantity : undefined,
      priceRaw: price,
      held: held?.quantity || 0,
      firstBuyDate: first || null,
      hasAsset: isCashKind(kind) ? false : !!asset,
      cashKnown: known,
      cashAfterNzd: known ? next.cashAfterNzd : 0,
      cashChangeNzd: next.cashChangeNzd,
      needsCash: known && (next.cashChangeNzd < -1e-6 || kind === "buy" || kind === "withdraw" || kind === "tax"),
    });
    setProblems(messages);
    if (messages.length) return;
    setCashNote(known ? "" : "Cash is still loading. Confirm checks the balance before anything is written.");
    setPreview(next);
    setDupAck(false);
    setDupWarning("");
    if (kind === "dividend" && asset) {
      const tx = await api.get<{ transactions?: DividendTxLike[] }>("/api/transactions");
      const rows = tx.ok && Array.isArray(tx.data?.transactions) ? tx.data!.transactions! : [];
      const dup = findDuplicateDividendTx(rows, {
        ticker: asset.symbol,
        when: next.date,
        amounts: [next.priceNative, next.priceNzd],
      });
      if (dup) setDupWarning(duplicateDividendMessage(asset.symbol));
    }
    if (!reviewKey.current) {
      const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
      reviewKey.current = random.slice(0, 80);
    }
    armReview();
    setStep("review");
  }

  function failSave(message: string) {
    setSaveError(message);
    toast.error(message);
  }

  async function confirm() {
    if (step !== "review" || !preview || saving || !confirmReady) return;
    if (dupWarning && !dupAck) {
      setSaveError("Tick “Save anyway” to record a second dividend for this date and amount, or cancel.");
      return;
    }
    if (!claimCommit()) return;
    setSaving(true);
    setSaveError("");
    try {
      if (!(bookKnown || cashKnown)) {
        const tx = await api.get<{ cashBalance?: number }>("/api/transactions");
        const loaded = tx.ok && tx.data && typeof tx.data.cashBalance === "number" ? tx.data.cashBalance : null;
        if (loaded != null) {
          setBookCash(loaded);
          setBookKnown(true);
          if (preview.cashChangeNzd < -1e-6 && loaded + preview.cashChangeNzd < -0.009) {
            failSave("This would take cash below zero.");
            return;
          }
        } else if (preview.cashChangeNzd < -1e-6 || kind === "buy" || kind === "withdraw" || kind === "tax") {
          failSave("Cash is still loading. Wait a moment, then confirm.");
          return;
        }
      }
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
          failSave(typeof res.error === "string" ? res.error : "Could not record that sale.");
          return;
        }
        bumpHoldingsGeneration();
        toast.success("Sale recorded");
        onDone(res.data);
        onRequestClose();
        return;
      }
      if (kind === "correction") {
        if (!seed?.holdingId) {
          failSave("This correction needs the holding it belongs to.");
          return;
        }
        const res = await api.put(`/api/stocks/${seed.holdingId}`, {
          ticker: preview.asset,
          asset_type: asset?.assetType || seed.assetType,
          shares: preview.quantity,
          purchase_price: preview.priceNative,
          purchase_date: preview.date,
          notes: notes.trim() || undefined,
        });
        if (!res.ok) {
          failSave(typeof res.error === "string" ? res.error : "Could not record that correction.");
          return;
        }
        bumpHoldingsGeneration();
        toast.success("Correction recorded");
        onDone(res.data);
        onRequestClose();
        return;
      }
      const payload: Record<string, unknown> = {
        type: kind,
        notes: notes.trim() || undefined,
        executed_at: executedAtForLedger(preview.date, today),
        fees: preview.feeNative,
      };
      if (showQty && asset) {
        payload.ticker = asset.symbol.toUpperCase();
        payload.asset_type = asset.assetType;
        payload.asset_name = asset.name;
        payload.quantity = preview.quantity;
        payload.price = preview.priceNative;
        payload.fx_rate = preview.fxRate;
        payload.confirm = true;
        if (reviewKey.current) payload.idempotency_key = reviewKey.current;
        if (asset.id && asset.assetType === "crypto") payload.coingecko_id = asset.id;
        if (quoteOrigin === "snapshot" && !priceDirty) {
          payload.price_source = "live_quote";
          payload.quote_origin = "snapshot";
          if (priceAsAt) payload.price_as_at = priceAsAt;
          const chain = cleanChain(quoteChain);
          if (chain) payload.chain = chain;
        }
        if (asset.market === "DEX") {
          payload.venue = "DEX";
          const chain = cleanChain(asset.chain);
          if (chain) payload.chain = chain;
        }
      } else {
        payload.amount = preview.priceNative;
        if (kind === "dividend" && dupAck) payload.allow_duplicate = true;
        if (kind === "dividend" && asset) {
          payload.ticker = asset.symbol.toUpperCase();
          payload.asset_type = asset.assetType;
          payload.asset_name = asset.name;
        }
        if (kind === "opening_balance" && asset) {
          payload.ticker = asset.symbol.toUpperCase();
          payload.asset_type = asset.assetType;
          payload.asset_name = asset.name;
          payload.quantity = preview.quantity;
          payload.price = preview.priceNative;
          payload.confirm = true;
          delete payload.amount;
        }
      }
      // b37 G-10: every write is an explicit confirm with this Review's idempotency key, so a 401 is
      // retried once with the same key after the session check, and the server dedupes any repeat.
      payload.confirm = true;
      if (!reviewKey.current) reviewKey.current = newWriteKey();
      payload.idempotency_key = reviewKey.current;
      // Goal b19 CR-6: a new holding past the plan cap is refused before anything
      // paints. The server's dry run runs the same cap check and writes nothing,
      // so the cap message shows in this dialog instead of a flash-and-rollback.
      const newSleeve =
        (kind === "buy" || kind === "opening_balance") &&
        typeof payload.ticker === "string" &&
        payload.asset_type !== "metal" &&
        !holdings.some(
          (h) => h.ticker.toUpperCase() === String(payload.ticker).toUpperCase() && h.assetType === (payload.asset_type ?? "stock")
        );
      // b32 G-10: the dry run cost a full round trip on every new buy (TT: buy 2.97-4.30 s). It only
      // matters near a cap; well below the smallest cap the real POST's own cap check is enough.
      const distinctHeld = new Set(holdings.map((h) => `${h.assetType}:${h.ticker.toUpperCase()}`)).size;
      if (newSleeve && distinctHeld >= MIN_PLAN_HOLDING_CAP - 1) {
        const check = await api.post("/api/transactions?dryRun=1", payload);
        if (!check.ok && check.status === 403) {
          failSave(typeof check.error === "string" ? check.error : "You've reached your plan's holding limit.");
          return;
        }
      }
      const postedAt = Date.now();
      // Goal b12 G-10: paint cash, the holding and the ledger row now from the
      // reviewed figures. The saved row replaces it; a refusal rolls it back.
      // Goal b20 G-10: writes are authoritative. Nothing is painted before the
      // server confirms; the book is painted from the saved response, and a
      // refusal keeps the dialog open with the reason. (The b12 optimistic paint
      // let a refused write show and then vanish.)
      // b31 G-10: optimistic again, without b20's vanish. The row and the cash change paint
      // behind the dialog on Confirm; the dialog stays open ("Saving…") until the server
      // answers. A refusal rolls the paint back and the dialog shows the reason; success
      // reconciles from the saved row (handleDataChanged rebuilds from the pre-trade base).
      const optimistic = true as boolean;
      const cashBeforeOptimistic = preview.cashAfterNzd - preview.cashChangeNzd;
      if (optimistic) {
        const row = {
          _id: `optimistic-${postedAt}`,
          _optimistic: true,
          // b40 G-10: the key rides on the optimistic row, so a delete before the server answers can cancel it.
          notes: `idem=${String(payload.idempotency_key)}`,
          type: kind,
          ticker: typeof payload.ticker === "string" ? payload.ticker : undefined,
          asset_type: payload.asset_type,
          asset_name: payload.asset_name,
          quantity: payload.quantity,
          price: payload.price,
          fx_rate: payload.fx_rate,
          fees: payload.fees,
          amount: payload.amount,
          executed_at: payload.executed_at,
        };
        onDone({ cashBalance: preview.cashAfterNzd, lastTransaction: row, transactions: [row], ledgerPartial: true, optimistic: true });
      }
      // b37 G-10 (P1): journal the write before sending it. If the page reloads or the tab closes
      // mid-request (TT's lost deposit was a POST the browser dropped: edge 499, no origin response), the
      // next dashboard load replays it with the same key and the server writes it at most once.
      const journalUser = getActiveAccountUserId();
      if (journalUser) journalPendingWrite({ key: String(payload.idempotency_key), userId: journalUser, method: "POST", payload, at: postedAt });
      // The dialog stays open ("Saving…") until the server answers with the saved row's id. No early close
      // and no background finish: success is shown only after that, and a failure keeps the form filled.
      const pending = withWriteTimeout(api.post("/api/transactions", payload), WRITE_TIMEOUT_MS);
      const res = await pending;
      console.log(`[write] ${kind} ${typeof payload.ticker === "string" ? payload.ticker : ""} status=${res.status ?? "?"} ok=${res.ok} id=${String((("data" in res ? res.data : undefined) as { lastTransaction?: { _id?: string } } | undefined)?.lastTransaction?._id ?? "")}`);
      const savedId = acknowledgedId(res);
      if (optimistic && !savedId) {
        // Roll back, then fall through: the dialog (still open) shows the refusal reason.
        onDone({ cashBalance: cashBeforeOptimistic, lastTransaction: null, transactions: [], ledgerPartial: true, optimisticRollback: true });
      }
      const dupRefused =
        !res.ok &&
        kind === "dividend" &&
        res.status === 409 &&
        ((res as { code?: string }).code === DUPLICATE_DIVIDEND_CODE ||
          (typeof res.error === "string" && res.error.includes("already recorded")));
      if (dupRefused) {
        // The server found the duplicate (the Review check may have missed a row added elsewhere).
        setDupWarning(typeof res.error === "string" ? res.error : duplicateDividendMessage(asset?.symbol || ""));
        setDupAck(false);
        failSave("This dividend looks like one already recorded. Tick “Save anyway” to keep both.");
        return;
      }
      if (!res.ok && isDefiniteRefusal(res.status)) clearPendingWrite(String(payload.idempotency_key));
      if (!res.ok && res.status == null && res.error === WRITE_TIMEOUT_CODE) {
        // Not a refusal: the answer didn't arrive in time. Keep the form and the journal entry; pressing
        // Confirm again (or reloading) retries with the same key, so it can't be booked twice.
        failSave(WRITE_TIMEOUT_MESSAGE);
        return;
      }
      if (!res.ok) {
        failSave(writeError(res.error, "Could not record that transaction."));
        return;
      }
      if (!savedId) {
        failSave(NOT_ACKNOWLEDGED);
        return;
      }
      if (showQty) bumpHoldingsGeneration();
      clearPendingWrite(String(payload.idempotency_key));
      // b40 G-10 (TT b39 P1): the member deleted the row while it was saving. Delete it on arrival.
      if (isCancelledWriteKey(String(payload.idempotency_key))) {
        const key = String(payload.idempotency_key);
        const del = await api.delete(`/api/transactions?id=${encodeURIComponent(savedId)}&idem=${encodeURIComponent(key)}`);
        if (del.ok || del.status === 404) {
          clearCancelledWriteKey(key);
          reviewKey.current = "";
          noteWrite(getActiveAccountUserId(), { deletedId: savedId });
          toast.success("Saved, then removed as you asked");
          onDone({ cashBalance: undefined, lastTransaction: null, transactions: [], ledgerPartial: true, optimisticRollback: true, removedAfterSave: savedId });
          onRequestClose();
          return;
        }
        toast.error("It was saved, but the removal you asked for didn't go through. Delete it again from the list.");
      }
      reviewKey.current = "";
      noteWrite(getActiveAccountUserId(), { createdId: savedId, cashAfter: (res.data as { cashBalance?: number } | undefined)?.cashBalance ?? null });
      toast.success("Transaction recorded");
      console.log(`[confirm] toast=${Date.now() - postedAt} follow-ups=after-toast`);
      onDone(res.data);
      onRequestClose();
    } catch (err) {
      // A network failure after the optimistic paint must not leave the guess on screen.
      onDone({ cashBalance: undefined, lastTransaction: null, transactions: [], ledgerPartial: true, optimisticRollback: true });
      throw err;
    } finally {
      setSaving(false);
      releaseCommit();
    }
  }

  const livePreview = step === "edit" ? buildPreview() : preview;
  const nzdTotal = livePreview
    ? movementNzdTotal(livePreview, currency === "NZD" ? 1 : Number(fxRate))
    : null;
  const movementBlocked =
    problems.length > 0 ||
    transactionProblems({
      type: kind,
      date,
      today,
      quantity: Number(quantity) || 0,
      price: Number(price) || 0,
      quantityRaw: showQty ? quantity : undefined,
      priceRaw: price,
      held: held?.quantity || 0,
      hasAsset: !!asset,
      cashKnown: bookKnown || cashKnown,
      cashAfterNzd: livePreview?.cashAfterNzd ?? 0,
      cashChangeNzd: livePreview?.cashChangeNzd ?? 0,
      needsCash: (livePreview?.cashChangeNzd ?? 0) < -1e-6 || kind === "buy" || kind === "withdraw" || kind === "tax",
    }).length > 0;
  const kindLabel = (id: RecordKind) => {
    if (id === "dividend" && asset) return distributionLabel(asset.assetType);
    return KINDS.find((item) => item.id === id)?.label || id;
  };

  return (
    <div data-testid="record-transaction-panel">
      {step === "review" && preview ? (
        <div className="space-y-3" data-testid="record-review">
          <div className="space-y-1.5 pt-1">
            <p className="font-display text-base font-bold leading-tight">Review</p>
            <p className="text-xs leading-normal text-muted-foreground">Nothing is written until you confirm.</p>
          </div>
          {cashNote ? <p className="text-sm text-muted-foreground">{cashNote}</p> : null}
          <ReviewRow label="Type" value={kindLabel(preview.type)} />
          {isCashKind(preview.type) ? (
            <ReviewRow label="Asset" value="Cash" />
          ) : preview.asset ? (
            <ReviewRow label="Asset" value={preview.assetName && preview.assetName !== preview.asset ? `${preview.asset} · ${preview.assetName}` : preview.asset} />
          ) : null}
          <ReviewRow label="Date" value={formatDisplayDate(preview.date)} />
          {showQty ? <ReviewRow label={asset?.assetType === "metal" ? "Ounces" : "Quantity"} value={formatQuantity(preview.quantity)} /> : null}
          <ReviewRow
            label={showQty ? "Price" : "Amount"}
            value={formatMoneyWithNzd(preview.priceNative, preview.currency, preview.priceNzd)}
          />
          <ReviewRow label="Exchange rate" value={preview.fxRate === 1 ? "1.0000 NZD" : `${formatFxInput(preview.fxRate)} NZD per 1 ${preview.currency}`} />
          <ReviewRow label="Fee" value={formatMoneyWithNzd(preview.feeNative, preview.currency, preview.feeNzd)} />
          {nzdTotal ? (
            <ReviewRow
              label="Total"
              value={nzdTotal.fx ? `${nzdTotal.nzd} · ${nzdTotal.fx}` : nzdTotal.nzd}
            />
          ) : null}
          <ReviewRow label="Cash change" value={cashNote ? "Still loading" : formatSignedMoney(preview.cashChangeNzd)} />
          <ReviewRow label="Cash after" value={cashNote ? "Still loading" : formatNzd(preview.cashAfterNzd)} />
          {dupWarning ? (
            <div role="alert" className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">Possible duplicate</p>
              <p>{dupWarning}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={dupAck} onChange={(e) => { setDupAck(e.target.checked); setSaveError(""); }} />
                Save anyway
              </label>
            </div>
          ) : null}
          {saveError ? (
            <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-700">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {kind === "correction" ? (
            <p className="text-sm text-muted-foreground">
              This writes a correction on the ledger for {asset?.symbol || "this holding"}. Cash does not move.
            </p>
          ) : (
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
                    if (isCashKind(item.id)) {
                      setAsset(null);
                      setQuery("");
                      setPrice("");
                      setQuantity("");
                      setCurrency("NZD");
                      setPriceDirty(false);
                      setPriceAsAt("");
                      setPriceSession("");
                      setQuoteOrigin("");
                      setQuoteChain("");
                      setHint("");
                    }
                  }}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
                    kind === item.id ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"
                  )}
                  aria-pressed={kind === item.id}
                >
                  {kindLabel(item.id)}
                </button>
              ))}
            </div>
          </div>
          )}

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
                  {asset.market === "DEX" && asset.chain ? (
                    <span className="shrink-0 text-[0.65rem] font-semibold text-muted-foreground">{asset.chain}</span>
                  ) : null}
                  {kind === "correction" ? null : (
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary"
                      onClick={() => {
                        setAsset(null);
                        setPriceDirty(false);
                        setPriceAsAt("");
                        setPriceSession("");
                        setHint("");
                        setQuoteOrigin("");
                        setQuoteChain("");
                      }}
                    >
                      Change
                    </button>
                  )}
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
                              <span className="flex shrink-0 items-center gap-1">
                                <span className={cn("rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase", badgeClass(hit.market))}>
                                  {hit.market}
                                </span>
                                {hit.market === "DEX" && hit.chain ? (
                                  <span className="text-[0.65rem] font-semibold text-muted-foreground">{hit.chain}</span>
                                ) : null}
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
              {/* b46 P3: on keyboard focus the native field shows, so the focused part (day, month or year) is visible.
                  b45 G-14 P3: Chrome's calendar button inside the hidden date input was an invisible extra tab
                  stop. It is hidden (CSS) and a click opens the picker instead; the input itself stays the one
                  keyboard stop (a tabindex of -1 on it would leave the date unreachable), with a visible ring. */}
              <div className="relative rounded-md focus-within:ring-2 focus-within:ring-ring">
                <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm">{formatDisplayDate(date)}</div>
                <input
                  id="record-date"
                  onClick={(e) => {
                    try {
                      (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                    } catch {
                      /* showPicker needs a user gesture; the native behaviour still applies */
                    }
                  }}
                  type="date"
                  max={today}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPriceDirty(false);
                    setPriceAsAt("");
                    setPriceSession("");
                    setHint("");
                    setQuoteOrigin("");
                    setQuoteChain("");
                    setFxDirty(false);
                  }}
                  className="af-date-overlay absolute inset-0 cursor-pointer rounded-md bg-background px-3 text-sm opacity-0 focus-visible:opacity-100 focus-visible:outline-none"
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
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    setProblems([]);
                  }}
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
                    setQuoteOrigin("");
                    setPriceAsAt("");
                    setPriceSession("");
                    setHint("");
                    setQuoteChain("");
                    setProblems([]);
                  }}
                />
              </div>
            )}
            {showQty ? (
              <div className="space-y-1.5">
                <Label htmlFor="record-price">{shownTradePriceLabel(priceAsAt, priceDirty, priceSession)}</Label>
                <Input
                  id="record-price"
                  aria-invalid={(kind === "buy" || kind === "sell") && price.trim() !== "" && !(Number(price) > 0)}
                  inputMode="decimal"
                  value={price}
                  placeholder="Price per unit"
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceDirty(true);
                    setQuoteOrigin("");
                    setPriceAsAt("");
                    setPriceSession("");
                    setHint("");
                    setQuoteChain("");
                    setProblems([]);
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
                  setFxDirty(false);
                  setFxRate(openingFx({ currency: next, live: fxLive, liveRate: rates[next] }) || "");
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
                value={
                  kind === "correction" && hint.startsWith("Fetching the close") && !fxDirty
                    ? ""
                    : cashMovement || currency === "NZD"
                      ? "1.0000"
                      : fxRate
                }
                placeholder={
                  kind === "correction" && hint.startsWith("Fetching the close") && !fxDirty ? "Loading" : undefined
                }
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
              <p className="text-[0.7rem] text-muted-foreground">
                Defaults to NZ$0.00. Type your broker's fee.{" "}
                <button type="button" className="underline decoration-dotted underline-offset-2" title={PAPER_FEE_SUMMARY}>
                  Fee details
                </button>
              </p>
            </div>
          </div>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          {step === "edit" && nzdTotal ? (
            <p className="text-sm" data-testid="record-nzd-total">
              Total <span className="tnum font-semibold">{nzdTotal.nzd}</span>
              {nzdTotal.fx ? <span className="text-muted-foreground"> · {nzdTotal.fx}</span> : null}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="record-notes">Notes</Label>
            <Input id="record-notes" value={notes} placeholder="Optional note for the ledger" onChange={(e) => setNotes(e.target.value)} />
          </div>
          {!(bookKnown || cashKnown) ? (
            <p className="text-sm text-muted-foreground">Loading cash…</p>
          ) : (kind === "buy" || kind === "sell") && currency !== "NZD" && !(Number(fxRate) > 0) ? (
            <p className="text-sm text-muted-foreground">Loading the exchange rate…</p>
          ) : livePreview && !movementBlocked ? (
            <p className="text-sm">
              Cash change{" "}
              <span className={cn("tnum font-semibold", livePreview.cashChangeNzd < 0 ? "text-rose-600" : "text-emerald-700")}>
                {formatSignedMoney(livePreview.cashChangeNzd)}
              </span>
              <span className="text-muted-foreground"> · cash after {formatNzd(livePreview.cashAfterNzd)}</span>
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
              reviewKey.current = "";
              disarmReview();
              setStep("edit");
            }}
          >
            Back
          </Button>
        ) : null}
        {step === "review" ? (
          <Button
            type="button"
            className="font-semibold"
            onClick={() => void confirm()}
            disabled={saving || !confirmReady}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        ) : (
          <Button
            type="button"
            className="font-semibold"
            onClick={() => void review()}
            disabled={checkingCash}
          >
            {checkingCash ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Checking cash…
              </>
            ) : (
              "Review"
            )}
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

function isCashKind(id: RecordKind): boolean {
  return id === "deposit" || id === "withdraw" || id === "tax";
}

function earliest(a?: string, b?: string | null): string {
  const left = dayOf(a);
  const right = dayOf(b);
  if (left && right) return left < right ? left : right;
  return left || right || "";
}

function holdingHit(row: BookHolding): AssetHit {
  const stored = dexFromHolding(row);
  const dex = isDexSource({ venue: stored.venue, market: stored.venue, sector: row.sector });
  const market: AssetMarket =
    row.assetType === "metal"
      ? row.ticker.toUpperCase() === "SILVER"
        ? "Silver"
        : "Gold"
      : row.assetType === "crypto"
        ? dex
          ? "DEX"
          : "Crypto"
        : marketForShare("", row.ticker);
  return {
    symbol: row.ticker,
    name: row.name,
    market,
    assetType: row.assetType,
    id: row.coinId,
    price: row.price,
    chain: stored.chain || undefined,
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
          ? seed.market === "DEX"
            ? "DEX"
            : "Crypto"
          : marketForShare("", seed.ticker);
    return {
      symbol: seed.ticker.toUpperCase(),
      name: seed.name || seed.ticker,
      market,
      assetType,
      id: seed.coinId,
      price: seed.price,
      chain: cleanChain(seed.chain) || undefined,
    };
  }
  if (preferred === "metal") return { symbol: "GOLD", name: "Gold bullion", market: "Gold", assetType: "metal" };
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
    venue: typeof row.venue === "string" ? row.venue : null,
    chain: cleanChain(row.chain),
    sector: typeof row.sector === "string" ? row.sector : null,
  };
}

function fromMetal(row: Record<string, unknown>): BookHolding {
  const metal = String(row.metal || "").toLowerCase();
  const ticker = metal === "silver" ? "SILVER" : "GOLD";
  return {
    id: String(row._id || ticker),
    ticker,
    name: metal === "silver" ? "Silver bullion" : "Gold bullion",
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
  venue?: string | null;
  chain?: string | null;
  sector?: string | null;
}): BookHolding {
  const stored = dexFromHolding(row);
  return fromStock({
    _id: row._id,
    ticker: row.ticker,
    company_name: row.company_name,
    asset_type: row.asset_type || (row.metalSourceId ? "metal" : "stock"),
    shares: row.shares,
    current_price: row.current_price,
    purchase_price: row.purchase_price,
    purchase_date: row.purchase_date,
    venue: stored.venue || row.venue,
    chain: stored.chain,
    sector: row.sector,
  });
}
