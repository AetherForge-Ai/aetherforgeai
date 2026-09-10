"use client";

import Image from "next/image";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DashboardSectionTitle } from "@/components/dashboard/DashboardSectionTitle";
import {
  Coins,
  Gem,
  Plus,
  Loader2,
  TrendingUp,
  TrendingDown,
  Lock,
  Sparkles,
  RefreshCw,
  BadgeCheck,
  Minus,
  Check,
  X,
} from "lucide-react";

type MetalKey = "gold" | "silver";

interface MetalHolding {
  _id: string;
  metal: MetalKey;
  ounces: number;
  purchase_price_per_oz: number;
}

interface MetalSpot {
  usdPerOz: number;
  nzdPerOz: number;
}

interface MetalsSpot {
  gold: MetalSpot;
  silver: MetalSpot;
  live: boolean;
  fxLive: boolean;
  asOf: string;
}

const METAL_META: Record<MetalKey, { label: string; icon: React.ElementType; color: string; ring: string }> = {
  gold: { label: "Gold", icon: Coins, color: "text-[var(--gold)]", ring: "border-[var(--gold)]/40 bg-[var(--gold)]/10" },
  silver: { label: "Silver", icon: Gem, color: "text-slate-300", ring: "border-slate-400/40 bg-slate-400/10" },
};

/**
 * PreciousMetals — bonus dashboard section (free for active paying members).
 * Members log their gold / silver holdings in troy ounces and the price/oz they
 * paid; today's value is computed live from the current-day spot price (NZD).
 */
export function PreciousMetals({
  entitled,
  plan,
  onChanged,
}: {
  entitled: boolean;
  plan?: string | null;
  /** Called after any buy/sell so the parent can refresh cash + the ledger. */
  onChanged?: () => void;
}) {
  const [metals, setMetals] = useState<MetalHolding[]>([]);
  const [spot, setSpot] = useState<MetalsSpot | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Add-form state.
  const [metal, setMetal] = useState<MetalKey>("gold");
  const [ounces, setOunces] = useState("");
  const [price, setPrice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<{ metals: MetalHolding[]; spot: MetalsSpot }>("/api/metals");
    if (res.ok && res.data) {
      setMetals(res.data.metals || []);
      setSpot(res.data.spot);
      console.log("[metals] Loaded", res.data.metals?.length ?? 0, "holdings; spot live:", res.data.spot?.live);
    } else {
      console.error("[metals] Load failed:", res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (entitled) load();
    else setLoading(false);
  }, [entitled, load]);

  const spotFor = useCallback((m: MetalKey): number => (spot ? spot[m].nzdPerOz : 0), [spot]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const h of metals) {
      value += h.ounces * spotFor(h.metal);
      cost += h.ounces * h.purchase_price_per_oz;
    }
    const gain = value - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    return { value, cost, gain, gainPct };
  }, [metals, spotFor]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const oz = parseFloat(ounces);
    const pp = parseFloat(price);
    if (!isFinite(oz) || oz <= 0) return toast.error("Enter how many ounces you own.");
    if (!isFinite(pp) || pp <= 0) return toast.error("Enter the price per ounce you paid.");

    setAdding(true);
    console.log("[metals] Adding", metal, oz, "oz @", pp, "/oz");
    const res = await api.post("/api/metals", {
      metal,
      ounces: oz,
      purchase_price_per_oz: pp,
    });
    setAdding(false);
    if (res.ok) {
      const cost = oz * pp;
      toast.success(
        `Bought ${oz} oz ${METAL_META[metal].label} · ${formatMoney(cost, "NZD")} debited from cash`
      );
      setOunces("");
      setPrice("");
      load();
      onChanged?.(); // refresh cash balance + the Transaction Center ledger
    } else {
      console.error("[metals] Add failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not add your metal holding.");
    }
  }

  // Selling at spot credits cash, books realized P&L and logs it in the ledger.
  async function handleSell(id: string) {
    setSellingId(id);
    setConfirmId(null);
    const res = await api.delete<{ cashBalance: number; realizedNZD: number; proceeds: number }>(
      `/api/metals/${id}`
    );
    setSellingId(null);
    if (res.ok && res.data) {
      const { proceeds, realizedNZD } = res.data;
      toast.success(
        `Sold at spot · ${formatMoney(proceeds, "NZD")} added to cash` +
          (typeof realizedNZD === "number"
            ? ` · ${realizedNZD >= 0 ? "+" : ""}${formatMoney(realizedNZD, "NZD")} realized`
            : "")
      );
      setMetals((prev) => prev.filter((m) => m._id !== id));
      onChanged?.(); // refresh cash balance + the Transaction Center ledger
    } else {
      console.error("[metals] Sell failed:", res.error);
      toast.error(typeof res.error === "string" ? res.error : "Could not sell holding.");
    }
  }

  const HeaderBadge = (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--gold)]">
      <Sparkles className="size-3" /> Member bonus
    </span>
  );

  /* ---------------------------- Locked (upsell) --------------------------- */
  if (!entitled) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card/50 p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--gold)]/12 text-[var(--gold)]">
          <Lock className="size-7" />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold">
          Precious Metals Overview
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Track your gold &amp; silver alongside your shares — valued live against today's spot
          price. This bonus is free for every active paying member.
        </p>
        <Button asChild className="mt-5 font-semibold shadow-glow">
          <Link href="/pricing">
            <Sparkles className="mr-2 size-4" /> Upgrade to unlock
          </Link>
        </Button>
      </div>
    );
  }

  /* ------------------------------- Entitled ------------------------------- */
  return (
    <div className="rounded-3xl border border-border/70 bg-card/50">
      {/* Title + refresh — old icon/badge/subtitle chrome removed */}
      <div className="border-b border-border/60 px-4 pt-5 sm:px-6">
        <DashboardSectionTitle
          title="Precious Metals Overview"
          avatarSrc="/brand/bot-smitty-holdings.png"
          avatarAlt="Smitty the blacksmith with gold and silver trolley"
          avatarPose="push"
        />
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh spot
          </Button>
        </div>
      </div>

      <div className="p-6">
        {/* Live spot price cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {(["gold", "silver"] as MetalKey[]).map((m) => {
            const meta = METAL_META[m];
            const Icon = meta.icon;
            const s = spot?.[m];
            return (
              <div key={m} className={cn("relative overflow-hidden rounded-2xl border p-4", meta.ring)}>
                <div className="relative z-10 flex max-w-[70%] flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("size-5", meta.color)} />
                      <span className="font-display text-base font-bold">{meta.label} spot</span>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide",
                        spot?.live ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
                      )}
                      title={spot?.live ? "Live spot price" : "Fallback price (live feed unavailable)"}
                    >
                      {spot?.live ? "Live" : "Est."}
                    </span>
                  </div>
                  <p className="tnum mt-3 font-display text-2xl font-bold">
                    {s ? `${formatMoney(s.nzdPerOz, "NZD")}` : "—"}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">/oz</span>
                  </p>
                  <p className="tnum mt-0.5 text-xs text-muted-foreground">
                    {s ? `${formatMoney(s.usdPerOz, "USD")}/oz global spot` : "Loading spot…"}
                  </p>
                </div>
                <div className="pointer-events-none absolute bottom-1 right-1 h-20 w-20 sm:h-24 sm:w-24">
                  <Image
                    src={m === "gold" ? "/brand/gold-bricks-stack.png" : "/brand/silver-bricks-stack.png"}
                    alt=""
                    fill
                    className="object-contain object-bottom"
                    sizes="96px"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <Label className="text-xs">Metal</Label>
            <Select value={metal} onValueChange={(v) => setMetal(v as MetalKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="silver">Silver</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="metal-oz">Ounces owned (oz)</Label>
            <Input
              id="metal-oz"
              inputMode="decimal"
              placeholder="e.g. 10"
              value={ounces}
              onChange={(e) => setOunces(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="metal-price">Purchase price / oz (NZD)</Label>
            <Input
              id="metal-price"
              inputMode="decimal"
              placeholder="e.g. 3200"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={adding} className="font-semibold">
            {adding ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
            Buy
          </Button>
        </form>
        <p className="mt-2 px-1 text-[0.7rem] text-muted-foreground">
          Buying debits your cash balance and logs the purchase in the Transaction Center. Selling credits cash at
          today's spot price and books your realized gain/loss.
        </p>

        {/* Holdings table */}
        {loading ? (
          <div className="mt-6 space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : metals.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-[var(--gold)]/10 text-[var(--gold)]">
              <Coins className="size-6" />
            </span>
            <p className="mt-3 font-medium">No metals tracked yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Add how many ounces of gold or silver you own and what you paid — we'll value it live.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pr-3 font-medium">Metal</th>
                  <th className="px-3 py-3 text-right font-medium">Ounces</th>
                  <th className="px-3 py-3 text-right font-medium">Cost / oz</th>
                  <th className="px-3 py-3 text-right font-medium">Spot / oz</th>
                  <th className="px-3 py-3 text-right font-medium">Value today</th>
                  <th className="px-3 py-3 text-right font-medium">Gain/Loss</th>
                  <th className="py-3 pl-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {metals.map((h) => {
                  const meta = METAL_META[h.metal];
                  const Icon = meta.icon;
                  const spotPerOz = spotFor(h.metal);
                  const value = h.ounces * spotPerOz;
                  const cost = h.ounces * h.purchase_price_per_oz;
                  const gain = value - cost;
                  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
                  const up = gain >= 0;
                  return (
                    <tr key={h._id} className="border-b border-border/40 last:border-0 hover:bg-background/40">
                      <td className="py-3.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn("grid size-8 place-items-center rounded-lg", meta.ring)}>
                            <Icon className={cn("size-4", meta.color)} />
                          </span>
                          <span className="font-semibold">{meta.label}</span>
                        </div>
                      </td>
                      <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                        {h.ounces.toLocaleString("en-NZ", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                        {formatMoney(h.purchase_price_per_oz, "NZD")}
                      </td>
                      <td className="tnum px-3 py-3.5 text-right">{formatMoney(spotPerOz, "NZD")}</td>
                      <td className="tnum px-3 py-3.5 text-right font-medium">{formatMoney(value, "NZD")}</td>
                      <td className="px-3 py-3.5 text-right">
                        <span className={cn("tnum font-medium", up ? "text-emerald-600" : "text-rose-600")}>
                          {up ? "+" : ""}{formatMoney(gain, "NZD")}
                        </span>
                        <span className={cn("tnum block text-xs", up ? "text-emerald-600/80" : "text-rose-600/80")}>
                          {up ? "+" : ""}{gainPct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        {confirmId === h._id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">
                              Sell for {formatMoney(value, "NZD")}?
                            </span>
                            <button
                              onClick={() => handleSell(h._id)}
                              disabled={sellingId === h._id}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25"
                              aria-label={`Confirm sell ${meta.label}`}
                            >
                              {sellingId === h._id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5" />
                              )}
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              disabled={sellingId === h._id}
                              className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
                              aria-label="Cancel"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(h._id)}
                            disabled={sellingId === h._id}
                            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600"
                            aria-label={`Sell ${meta.label}`}
                          >
                            <Minus className="size-3.5" /> Sell
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {metals.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border/60 font-medium">
                    <td className="py-3.5 pr-3" colSpan={4}>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <BadgeCheck className="size-4 text-[var(--gold)]" /> Metals total
                      </span>
                    </td>
                    <td className="tnum px-3 py-3.5 text-right font-display text-base font-bold">
                      {formatMoney(totals.value, "NZD")}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <span className={cn("tnum font-bold", totals.gain >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {totals.gain >= 0 ? (
                          <TrendingUp className="mr-1 inline size-3.5" />
                        ) : (
                          <TrendingDown className="mr-1 inline size-3.5" />
                        )}
                        {totals.gain >= 0 ? "+" : ""}{formatMoney(totals.gain, "NZD")}
                      </span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <p className="mt-4 text-[0.7rem] text-muted-foreground">
          Spot prices reflect the current-day global gold (XAU) &amp; silver (XAG) benchmark,
          converted to NZD. Enter your purchase price per ounce in NZD.
        </p>
      </div>
    </div>
  );
}

export default PreciousMetals;
