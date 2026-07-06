"use client";

/**
 * Price Alerts — per-holding share-price notifications with execution instructions.
 *
 * Each alert captures a trim rule (e.g. "trim 25% at a 6-7% dip"), a hard sell-out
 * price, a take-profit band (e.g. 12-15%) and free-text execution instructions.
 * Alerts are evaluated server-side against a live reference price; when the price
 * drops to/below the hard sell-out price the alert shows as TRIGGERED.
 */

import * as React from "react";
import { api } from "@/lib/api";
import type { Stock } from "@/lib/portfolio";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BellRing, Plus, Loader2, Trash2, Pencil, TriangleAlert, ShieldCheck } from "lucide-react";

export interface PriceAlert {
  _id: string;
  ticker: string;
  stockId: string | null;
  trimPct: number | null;
  trimTriggerDipPct: number | null;
  hardSellPrice: number | null;
  takeProfitMinPct: number | null;
  takeProfitMaxPct: number | null;
  instructions: string;
  status: string;
  currentPrice: number;
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

function money(n?: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || isNaN(n) ? null : n;
}

export function PriceAlerts({ stocks }: { stocks: Stock[] }) {
  const [alerts, setAlerts] = React.useState<PriceAlert[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Ticker of the alert queued for deletion (for a clearer confirm message).
  const deleteTarget = React.useMemo(
    () => alerts.find((a) => a._id === deleteId) ?? null,
    [alerts, deleteId]
  );

  const load = React.useCallback(async () => {
    const res = await api.get<PriceAlert[]>("/api/alerts");
    if (res.ok && res.data) setAlerts(res.data);
    else console.error("[PriceAlerts] load failed:", res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditingId(null);
    const first = stocks[0];
    setForm({
      ...EMPTY_FORM,
      ticker: first?.ticker ?? "",
      stockId: first?._id ?? "",
      hardSellPrice: first ? (first.purchase_price * 0.9).toFixed(2) : "",
    });
    setOpen(true);
  }

  function openEdit(a: PriceAlert) {
    setEditingId(a._id);
    setForm({
      ticker: a.ticker,
      stockId: a.stockId ?? "",
      trimPct: a.trimPct?.toString() ?? "",
      trimTriggerDipPct: a.trimTriggerDipPct?.toString() ?? "",
      hardSellPrice: a.hardSellPrice?.toString() ?? "",
      takeProfitMinPct: a.takeProfitMinPct?.toString() ?? "",
      takeProfitMaxPct: a.takeProfitMaxPct?.toString() ?? "",
      instructions: a.instructions ?? "",
    });
    setOpen(true);
  }

  function onPickHolding(stockId: string) {
    const s = stocks.find((x) => x._id === stockId);
    setForm((f) => ({
      ...f,
      stockId,
      ticker: s?.ticker ?? f.ticker,
      hardSellPrice: f.hardSellPrice || (s ? (s.purchase_price * 0.9).toFixed(2) : ""),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker.trim()) return toast.error("Choose a holding or enter a ticker.");
    setSaving(true);
    const body = {
      ticker: form.ticker.trim().toUpperCase(),
      stockId: form.stockId || undefined,
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
            <h2 className="font-display text-lg font-bold">Share-price alerts</h2>
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
            {alerts.map((a) => (
              <li
                key={a._id}
                className={cn(
                  "rounded-2xl border p-4",
                  a.triggered ? "border-rose-500/40 bg-rose-500/5" : "border-border/60 bg-background/40"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold">{a.ticker}</span>
                  {a.triggered ? (
                    <Badge className="bg-rose-500/15 text-rose-400 hover:bg-rose-500/15">
                      <TriangleAlert className="mr-1 size-3" /> Sell-out hit
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                      <ShieldCheck className="mr-1 size-3" /> Watching
                    </Badge>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current</span>
                    <span className="tnum font-medium">{money(a.currentPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hard sell-out</span>
                    <span className="tnum font-medium">{money(a.hardSellPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trim</span>
                    <span className="tnum font-medium">
                      {a.trimPct != null ? `${a.trimPct}%` : "—"}
                      {a.trimTriggerDipPct != null ? ` @ -${a.trimTriggerDipPct}%` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Take profit</span>
                    <span className="tnum font-medium">
                      {a.takeProfitMinPct != null || a.takeProfitMaxPct != null
                        ? `${a.takeProfitMinPct ?? "?"}-${a.takeProfitMaxPct ?? "?"}%`
                        : "—"}
                    </span>
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
            ))}
          </ul>
        )}
      </div>

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit alert" : "New price alert"}</DialogTitle>
            <DialogDescription>
              Define the execution rules. We monitor the price and flag when your sell-out is hit.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {stocks.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Holding</Label>
                <Select value={form.stockId} onValueChange={onPickHolding}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a holding" />
                  </SelectTrigger>
                  <SelectContent>
                    {stocks.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.ticker} — {s.company_name || s.ticker}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="al-ticker">Ticker</Label>
                <Input
                  id="al-ticker"
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  placeholder="AAPL"
                  className="uppercase"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="al-trim">Trim %</Label>
                <Input id="al-trim" type="number" step="any" value={form.trimPct} onChange={(e) => setForm({ ...form, trimPct: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="al-dip">Trim at dip of %</Label>
                <Input id="al-dip" type="number" step="any" value={form.trimTriggerDipPct} onChange={(e) => setForm({ ...form, trimTriggerDipPct: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="al-hard">Hard sell-out price</Label>
                <Input id="al-hard" type="number" step="any" value={form.hardSellPrice} onChange={(e) => setForm({ ...form, hardSellPrice: e.target.value })} placeholder="135.00" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="al-tpmin">Profit min %</Label>
                  <Input id="al-tpmin" type="number" step="any" value={form.takeProfitMinPct} onChange={(e) => setForm({ ...form, takeProfitMinPct: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="al-tpmax">Profit max %</Label>
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

            <DialogFooter>
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
