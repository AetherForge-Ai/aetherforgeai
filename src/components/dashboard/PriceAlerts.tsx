"use client";

/**
 * Price Alerts — per-holding share / crypto price notifications with execution instructions.
 *
 * Each alert captures a trim rule (e.g. "trim 25% at a 6-7% dip"), a hard sell-out
 * price, a take-profit band (e.g. 12-15%) and free-text execution instructions.
 * Alerts are evaluated server-side against a live reference price; when the price
 * drops to/below the hard sell-out price the alert shows as TRIGGERED.
 */

import * as React from "react";
import { api } from "@/lib/api";
import { formatPercent, type Stock } from "@/lib/portfolio";
import { evaluateCryptoAlert } from "@/lib/crypto-live";
import { formatMoney, formatPriceInput, currencyForTicker, type CurrencyCode } from "@/lib/currency";
import { alertsForDesk } from "@/lib/alert-desk";
import { formatSellStopChip, formatTrimChip } from "@/lib/alert-labels";
import { useLiveCryptoQuotes } from "@/hooks/useLiveCryptoQuotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { keepDialogOpenOnPortalInteraction, keepDialogOpenWhilePopoverOpen, guardDialogOpenChange } from "@/lib/dialog-guards";
import { TickerSearch, type TickerMatch } from "@/components/dashboard/TickerSearch";
import { CryptoSearch } from "@/components/dashboard/CryptoSearch";
import type { CoinMarket } from "@/lib/crypto-market";
import { BellRing, Plus, Loader2, Trash2, Pencil, TriangleAlert, ShieldCheck, TrendingUp, TrendingDown } from "lucide-react";

export interface PriceAlert {
  _id: string;
  ticker: string;
  stockId: string | null;
  assetType?: "stock" | "crypto" | "metal";
  trimPct: number | null;
  trimTriggerDipPct: number | null;
  hardSellPrice: number | null;
  takeProfitMinPct: number | null;
  takeProfitMaxPct: number | null;
  instructions: string;
  status: string;
  currentPrice: number;
  purchasePrice?: number | null;
  pnlPct?: number | null;
  trimming?: boolean;
  triggered: boolean;
}

interface FormState {
  ticker: string;
  stockId: string;
  trimPct: string;
  trimTriggerDipPct: string;
  hardSellPrice: string;
  takeProfitMinPct: string;
  takeProfitMaxPct: string;
  instructions: string;
}

const EMPTY_FORM: FormState = {
  ticker: "",
  stockId: "",
  trimPct: "25",
  trimTriggerDipPct: "6",
  hardSellPrice: "",
  takeProfitMinPct: "12",
  takeProfitMaxPct: "15",
  instructions: "Trim 25% at a 6-7% dip. Hard sell-out at the floor price. Take profits in the 12-15% band.",
};

function money(n: number | null | undefined, ticker: string, crypto: boolean): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return formatMoney(n, currencyForTicker(ticker, crypto ? "crypto" : "stock"));
}

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || isNaN(n) ? null : n;
}

// Same adaptive width as holdings (4 sig figs under $1, 6 under $0.01).
function priceWithCurrency(n: number, currency?: string | null): string {
  const code = (currency || "").toUpperCase();
  if (code === "NZD" || code === "USD" || code === "AUD" || code === "GBP") {
    return formatMoney(n, code as CurrencyCode);
  }
  const body = formatPriceInput(n);
  return currency ? `${body} ${currency}` : formatMoney(n, "USD");
}

interface LiveQuote {
  symbol: string;
  price: number | null;
  currency: string | null;
  changePct: number | null;
}

export function PriceAlerts({
  stocks,
  assetType = "stock",
  holdingsReady = true,
  preview = false,
}: {
  stocks: Stock[];
  /** Hub context — stock desk, crypto desk, or metals. */
  assetType?: "stock" | "crypto" | "metal";
  /**
   * False while holdings are still hydrating. An empty array in that window
   * must not be treated as a flat book (that blanked the desk after Create).
   */
  holdingsReady?: boolean;
  preview?: boolean;
}) {
  const isCrypto = assetType === "crypto";
  const isMetal = assetType === "metal";
  const [alerts, setAlerts] = React.useState<PriceAlert[]>([]);
  const [loading, setLoading] = React.useState(!preview);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Same module-level snapshot as the holdings table. Alert tickers that are
  // not currently held join that one batched request.
  const cryptoSymbols = React.useMemo(() => {
    if (!isCrypto) return [];
    return [...stocks.map((s) => s.ticker), ...alerts.map((a) => a.ticker)];
  }, [isCrypto, stocks, alerts]);
  const cryptoLive = useLiveCryptoQuotes(cryptoSymbols, isCrypto && !preview);

  // Selected company + live quote shown inside the add/edit dialog.
  const [selectedName, setSelectedName] = React.useState("");
  const [quote, setQuote] = React.useState<LiveQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = React.useState(false);
  const quoteSeq = React.useRef(0);

  // Ticker of the alert queued for deletion (for a clearer confirm message).
  const deleteTarget = React.useMemo(
    () => alerts.find((a) => a._id === deleteId) ?? null,
    [alerts, deleteId]
  );

  const stocksRef = React.useRef(stocks);
  stocksRef.current = stocks;
  const loadSeq = React.useRef(0);
  // Quote ticks do not change which names are held. Reloading on every tick
  // raced an earlier empty-book response and left the desk on "No alerts yet".
  const bookKey = React.useMemo(
    () => stocks.map((s) => `${s._id}:${String(s.ticker).toUpperCase()}:${s.shares}`).join("|"),
    [stocks]
  );

  const load = React.useCallback(async () => {
    if (preview) return; // guest preview: no live alerts fetch
    const seq = ++loadSeq.current;
    const res = await api.get<PriceAlert[]>("/api/alerts");
    if (seq !== loadSeq.current) return;
    if (res.ok && res.data) {
      const book = holdingsReady ? stocksRef.current : null;
      setAlerts(alertsForDesk(res.data, assetType, book));
    } else if (res.status !== 401) console.error("[PriceAlerts] load failed:", res.error);
    if (seq === loadSeq.current) setLoading(false);
  }, [preview, assetType, holdingsReady, bookKey]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Fetch the live price for a symbol and show it inside the dialog. When the
  // hard sell-out field is still empty we seed a sensible floor (10% below).
  const fetchQuote = React.useCallback(async (symbol: string, seedFloor: boolean) => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) {
      setQuote(null);
      return;
    }
    const id = ++quoteSeq.current;
    setQuoteLoading(true);
    setQuote(null);
    const res = await api.get<LiveQuote>(
      `/api/tickers/quote?symbol=${encodeURIComponent(sym)}&type=${assetType}`
    );
    if (id !== quoteSeq.current) return; // superseded by a newer pick
    setQuoteLoading(false);
    if (res.ok && res.data) {
      setQuote(res.data);
      if (seedFloor && res.data.price != null) {
        const floor = formatPriceInput(res.data.price * 0.9);
        setForm((f) => (f.hardSellPrice.trim() ? f : { ...f, hardSellPrice: floor }));
      }
    } else {
      console.error("[PriceAlerts] quote fetch failed:", res.error);
      setQuote(null);
    }
  }, [assetType]);

  function openAdd() {
    setEditingId(null);
    setSelectedName("");
    setQuote(null);
    setQuoteLoading(false);
    // Crypto defaults match the 24/7 rules (sell −3% vs purchase, trim from +8%).
    // Saved alerts keep whatever the member already configured. Stock defaults stay.
    setForm(
      isCrypto
        ? {
            ...EMPTY_FORM,
            trimTriggerDipPct: "3",
            takeProfitMinPct: "8",
            takeProfitMaxPct: "12",
            instructions:
              "Sell out at -3% versus purchase. Start trimming 25% in the +8-12% band versus purchase.",
          }
        : { ...EMPTY_FORM }
    );
    setOpen(true);
  }

  function openEdit(a: PriceAlert) {
    setEditingId(a._id);
    const holding = stocks.find((s) => s._id === a.stockId || s.ticker === a.ticker);
    setSelectedName(holding?.company_name ?? "");
    setQuote(null);
    setForm({
      ticker: a.ticker,
      stockId: a.stockId ?? "",
      trimPct: a.trimPct?.toString() ?? "",
      trimTriggerDipPct: a.trimTriggerDipPct?.toString() ?? "",
      hardSellPrice: a.hardSellPrice != null && Number.isFinite(a.hardSellPrice) ? formatPriceInput(a.hardSellPrice) : "",
      takeProfitMinPct: a.takeProfitMinPct?.toString() ?? "",
      takeProfitMaxPct: a.takeProfitMaxPct?.toString() ?? "",
      instructions: a.instructions ?? "",
    });
    setOpen(true);
    if (a.ticker) fetchQuote(a.ticker, false);
  }

  // Pick a company from the searchable equity directory (ASX / NZX / NASDAQ / NYSE).
  function handlePickSymbol(m: TickerMatch) {
    const owned = stocks.find((s) => s.ticker.toUpperCase() === m.symbol.toUpperCase());
    setForm((f) => ({ ...f, ticker: m.symbol, stockId: owned?._id ?? "" }));
    setSelectedName(m.name);
    fetchQuote(m.symbol, true);
  }

  // Pick a coin from the live crypto universe.
  function handlePickCoin(c: CoinMarket) {
    const sym = (c.symbol || "").toUpperCase();
    const owned = stocks.find((s) => s.ticker.toUpperCase() === sym);
    setForm((f) => ({ ...f, ticker: sym, stockId: owned?._id ?? "" }));
    setSelectedName(c.name);
    fetchQuote(sym, true);
  }

  // Quick-pick one of the user's existing holdings.
  function handlePickHolding(stockId: string) {
    const s = stocks.find((x) => x._id === stockId);
    if (!s) return;
    setForm((f) => ({ ...f, stockId, ticker: s.ticker }));
    setSelectedName(s.company_name ?? "");
    fetchQuote(s.ticker, true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker.trim()) return toast.error("Choose a holding or enter a ticker.");
    setSaving(true);
    const body = {
      ticker: form.ticker.trim().toUpperCase(),
      stockId: form.stockId || undefined,
      assetType,
      trimPct: num(form.trimPct),
      trimTriggerDipPct: num(form.trimTriggerDipPct),
      hardSellPrice: num(form.hardSellPrice),
      takeProfitMinPct: num(form.takeProfitMinPct),
      takeProfitMaxPct: num(form.takeProfitMaxPct),
      instructions: form.instructions.trim(),
    };
    console.log("[PriceAlerts] saving alert", { editingId, body });
    const res = editingId
      ? await api.put(`/api/alerts/${editingId}`, body)
      : await api.post("/api/alerts", body);
    setSaving(false);
    if (res.ok) {
      toast.success(editingId ? "Alert updated" : "Alert created");
      setOpen(false);
      load();
    } else {
      console.error("[PriceAlerts] save failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not save the alert.");
    }
  }

  async function confirmDelete() {
    if (!deleteId || deleting) return;
    const id = deleteId;
    console.log("[PriceAlerts] deleting alert", id);
    setDeleting(true);
    // Optimistically remove from the list so it disappears instantly.
    setAlerts((prev) => prev.filter((a) => a._id !== id));
    const res = await api.delete(`/api/alerts/${id}`);
    setDeleting(false);
    setDeleteId(null);
    if (res.ok) {
      toast.success("Alert removed");
      load();
    } else {
      console.error("[PriceAlerts] delete failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not remove the alert.");
      load(); // restore the real server state if the delete failed
    }
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <BellRing className="size-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">
              {isMetal ? "Metals price alerts" : isCrypto ? "Crypto price alerts" : "Share-price alerts"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Set trim, hard sell-out and take-profit rules with execution instructions.
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="font-semibold">
          <Plus className="mr-1 size-4" /> New alert
        </Button>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-5 text-sm text-muted-foreground">
            No alerts yet. Create one to get execution instructions the moment a price hits your rules.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {alerts.map((a) => {
              const sym = a.ticker.toUpperCase();
              const holding = stocks.find((s) => s._id === a.stockId || s.ticker.toUpperCase() === sym);
              const polled = isCrypto ? cryptoLive.quotes[sym]?.price : undefined;
              const heldPx = holding && holding.current_price > 0 ? holding.current_price : null;
              const currentPrice =
                polled && polled > 0 ? polled : heldPx != null ? heldPx : a.currentPrice;
              const cryptoEval = isCrypto
                ? evaluateCryptoAlert({
                    purchasePrice: holding?.purchase_price ?? a.purchasePrice ?? null,
                    currentPrice,
                    trimTriggerDipPct: a.trimTriggerDipPct,
                    hardSellPrice: a.hardSellPrice,
                    takeProfitMinPct: a.takeProfitMinPct,
                    takeProfitMaxPct: a.takeProfitMaxPct,
                  })
                : null;
              const sell = isCrypto ? !!cryptoEval?.sell : a.triggered;
              const trimming = isCrypto && !!cryptoEval?.trimming && !sell;
              const pnlPct = cryptoEval?.pnlPct ?? null;
              return (
              <li
                key={a._id}
                className={cn(
                  "rounded-2xl border p-4",
                  sell ? "border-rose-500/40 bg-rose-500/5" : trimming ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-background/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold">{a.ticker}</span>
                  {sell ? (
                    <Badge className="bg-rose-500/15 text-rose-600 hover:bg-rose-500/15">
                      <TriangleAlert className="mr-1 size-3" /> Sell-out hit
                    </Badge>
                  ) : trimming ? (
                    <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">
                      <TrendingUp className="mr-1 size-3" /> Trim
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
                      <ShieldCheck className="mr-1 size-3" /> Watching
                    </Badge>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current</span>
                    <span className="tnum font-medium">{money(currentPrice, a.ticker, isCrypto)}</span>
                  </div>
                  {isCrypto && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">vs purchase</span>
                      <span className={cn("tnum font-medium", pnlPct != null && pnlPct < 0 ? "text-rose-600" : "text-emerald-600")}>
                        {pnlPct == null ? "—" : formatPercent(pnlPct)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hard sell-out</span>
                    <span className="tnum font-medium">{money(a.hardSellPrice, a.ticker, isCrypto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sell / stop</span>
                    <span className="tnum font-medium">{formatSellStopChip(a)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trim</span>
                    <span className="tnum font-medium">{formatTrimChip(a)}</span>
                  </div>
                </div>

                {a.instructions && (
                  <p className="mt-3 rounded-lg bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
                    {a.instructions}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 font-medium"
                    onClick={() => openEdit(a)}
                    aria-label={`Edit ${a.ticker} alert`}
                  >
                    <Pencil className="mr-1.5 size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-destructive/30 font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDeleteId(a._id)}
                    aria-label={`Remove ${a.ticker} alert`}
                  >
                    <Trash2 className="mr-1.5 size-3.5" /> Remove
                  </Button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={(next) => guardDialogOpenChange(next, setOpen)}>
        <DialogContent
          className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          // Keep the dialog open when interacting with the portaled ticker search.
          onInteractOutside={keepDialogOpenOnPortalInteraction}
          onPointerDownOutside={keepDialogOpenOnPortalInteraction}
          onFocusOutside={keepDialogOpenOnPortalInteraction}
          onEscapeKeyDown={keepDialogOpenWhilePopoverOpen}
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 sm:px-6">
            <DialogTitle>{editingId ? "Edit alert" : "New price alert"}</DialogTitle>
            <DialogDescription>
              Define the execution rules. We monitor the price and flag when your sell-out is hit.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-1.5">
              <Label>{isMetal ? "Metal" : isCrypto ? "Coin / ticker" : "Company / ticker"}</Label>
              {isMetal ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { t: "GOLD", n: "Gold bullion" },
                    { t: "SILVER", n: "Silver bullion" },
                  ].map((m) => (
                    <button
                      key={m.t}
                      type="button"
                      onClick={() => {
                        const owned = stocks.find(
                          (s) =>
                            s.ticker.toUpperCase() === m.t && !String(s._id).startsWith("pm-")
                        );
                        setForm((f) => ({ ...f, ticker: m.t, stockId: owned?._id ?? "" }));
                        setSelectedName(m.n);
                        fetchQuote(m.t, true);
                      }}
                      className={
                        "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors " +
                        (form.ticker === m.t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:text-foreground")
                      }
                    >
                      {m.t === "GOLD" ? "🥇 " : "🥈 "}
                      {m.n}
                    </button>
                  ))}
                </div>
              ) : isCrypto ? (
                <CryptoSearch value={form.ticker} label={selectedName} onSelect={handlePickCoin} />
              ) : (
                <TickerSearch value={form.ticker} label={selectedName} onSelect={handlePickSymbol} />
              )}
              <p className="text-[11px] text-muted-foreground">
                {isMetal
                  ? "Alert on live NZD spot for gold or silver."
                  : isCrypto
                    ? "Search the live crypto universe by name or ticker (BTC, ETH, SOL…)."
                    : "Search the full ASX, NZX, NASDAQ & NYSE (incl. all Dow Jones) universe by name or ticker."}
              </p>

              {/* Live company + price read-out for the chosen symbol. */}
              {form.ticker && (
                <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold">{form.ticker}</span>
                      {selectedName ? (
                        <span className="truncate text-xs text-muted-foreground">{selectedName}</span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-muted-foreground">Live current price</span>
                  </div>
                  <div className="shrink-0 text-right">
                    {quoteLoading ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Fetching…
                      </span>
                    ) : quote && quote.price != null ? (
                      <>
                        <div className="tnum text-sm font-bold">
                          {priceWithCurrency(quote.price, quote.currency)}
                        </div>
                        {quote.changePct != null && (
                          <div
                            className={cn(
                              "flex items-center justify-end gap-1 text-[11px] font-medium",
                              quote.changePct >= 0 ? "text-emerald-500" : "text-rose-500"
                            )}
                          >
                            {quote.changePct >= 0 ? (
                              <TrendingUp className="size-3" />
                            ) : (
                              <TrendingDown className="size-3" />
                            )}
                            {quote.changePct >= 0 ? "+" : ""}
                            {quote.changePct.toFixed(2)}%
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Price unavailable</span>
                    )}
                  </div>
                </div>
              )}

              {/* Quick-pick from the user's own holdings. */}
              {stocks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="w-full text-[11px] font-medium text-muted-foreground">Your holdings</span>
                  {stocks.map((s) => (
                    <button
                      key={s._id}
                      type="button"
                      onClick={() => handlePickHolding(s._id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        form.ticker.toUpperCase() === s.ticker.toUpperCase()
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      {s.ticker}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="al-trim">Trim %</Label>
                <Input id="al-trim" type="number" step="any" value={form.trimPct} onChange={(e) => setForm({ ...form, trimPct: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="al-dip">{isCrypto ? "Sell at loss vs purchase %" : "Trim at dip of %"}</Label>
                <Input id="al-dip" type="number" step="any" value={form.trimTriggerDipPct} onChange={(e) => setForm({ ...form, trimTriggerDipPct: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="al-hard">Hard sell-out price</Label>
                <Input id="al-hard" type="text" inputMode="decimal" value={form.hardSellPrice} onChange={(e) => setForm({ ...form, hardSellPrice: e.target.value })} placeholder="0.00058" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="al-tpmin">{isCrypto ? "Trim from %" : "Profit min %"}</Label>
                  <Input id="al-tpmin" type="number" step="any" value={form.takeProfitMinPct} onChange={(e) => setForm({ ...form, takeProfitMinPct: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="al-tpmax">{isCrypto ? "Trim through %" : "Profit max %"}</Label>
                  <Input id="al-tpmax" type="number" step="any" value={form.takeProfitMaxPct} onChange={(e) => setForm({ ...form, takeProfitMaxPct: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="al-instr">Execution instructions</Label>
              <Textarea
                id="al-instr"
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="e.g. Trim 25% at a 6-7% dip, hard sell-out at the floor, take profits 12-15%."
              />
            </div>

            </div>
            <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-5 py-4 sm:px-6">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="font-semibold">
                {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                {editingId ? "Save changes" : "Create alert"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm (lightweight) */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && !deleting && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Remove {deleteTarget ? `${deleteTarget.ticker} ` : ""}alert?
            </DialogTitle>
            <DialogDescription>
              This stops monitoring this rule. You can recreate it anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Trash2 className="mr-1 size-4" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default PriceAlerts;
