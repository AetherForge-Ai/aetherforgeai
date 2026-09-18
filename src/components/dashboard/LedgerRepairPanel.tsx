"use client";

/**
 * Ledger repaired screen — flags crypto 3× mismatches + equity prior-close issues.
 * Proposes qty/price fixes; never auto-changes cash_nzd.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ADVISORY_NOTE } from "@/lib/fill-integrity-client";
import { Wrench, AlertTriangle } from "lucide-react";

interface Flag {
  id: string;
  kind: string;
  ticker: string;
  quantity: number;
  fill_price: number;
  live_spot: number | null;
  ratio: number | null;
  cash_nzd: number | null;
  message: string;
  proposal?: { new_qty: number; new_price: number; note: string };
}

export function LedgerRepairPanel({ active = true }: { active?: boolean }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [examples, setExamples] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { qty: string; price: string; typedLive: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.get<{ flags: Flag[]; known_examples: Flag[] }>("/api/ledger/repair");
    setLoading(false);
    if (!res.ok || !res.data) {
      toast.error(typeof res.error === "string" ? res.error : "Repair scan failed");
      return;
    }
    setFlags(res.data.flags || []);
    setExamples(res.data.known_examples || []);
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  async function apply(flag: Flag) {
    if (flag.kind === "known_bad_example") {
      toast.message("Example only — apply repair on a real flagged holding.");
      return;
    }
    const d = drafts[flag.id] || {
      qty: String(flag.proposal?.new_qty ?? ""),
      price: String(flag.proposal?.new_price ?? flag.live_spot ?? ""),
      typedLive: "",
    };
    const res = await api.post("/api/ledger/repair", {
      holding_id: flag.id,
      new_qty: Number(d.qty),
      new_price: Number(d.price),
      typed_live_override: d.typedLive || undefined,
      soft_override_confirmed: true,
    });
    if (!res.ok) return toast.error(typeof res.error === "string" ? res.error : "Repair blocked");
    toast.success(`${flag.ticker} repaired — cash_nzd untouched`);
    void load();
  }

  const rows = [...flags, ...examples];

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg">
          <Wrench className="size-4 text-primary" /> Ledger repair
        </h3>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? "Scanning…" : "Rescan"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Flags crypto rows where qty×live vs qty×stored differs by &gt;3×, and equities booked at prior close on the next
        session. <strong>cash_nzd is never auto-changed.</strong> {ADVISORY_NOTE}
      </p>
      {rows.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">No integrity flags on current holdings.</p>
      )}
      <ul className="space-y-3">
        {rows.map((f) => {
          const d = drafts[f.id] || {
            qty: String(f.proposal?.new_qty ?? ""),
            price: String(f.proposal?.new_price ?? f.live_spot ?? ""),
            typedLive: "",
          };
          return (
            <li key={f.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-medium">
                    {f.ticker} · {f.kind}
                    {f.ratio != null ? ` · ratio ${f.ratio.toFixed(2)}×` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{f.message}</p>
                  <p className="text-xs">
                    qty {f.quantity} @ {f.fill_price} → propose {f.proposal?.new_qty?.toFixed?.(4) ?? "—"} @{" "}
                    {f.proposal?.new_price ?? "—"} (cash_nzd {f.cash_nzd ?? "n/a"} untouched)
                  </p>
                  {f.kind !== "known_bad_example" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="text-[0.65rem] uppercase text-muted-foreground">New qty</label>
                        <Input
                          className="h-8 w-28"
                          value={d.qty}
                          onChange={(e) => setDrafts((s) => ({ ...s, [f.id]: { ...d, qty: e.target.value } }))}
                        />
                      </div>
                      <div>
                        <label className="text-[0.65rem] uppercase text-muted-foreground">New price</label>
                        <Input
                          className="h-8 w-28"
                          value={d.price}
                          onChange={(e) => setDrafts((s) => ({ ...s, [f.id]: { ...d, price: e.target.value } }))}
                        />
                      </div>
                      <div>
                        <label className="text-[0.65rem] uppercase text-muted-foreground">Type live (10×)</label>
                        <Input
                          className="h-8 w-28"
                          value={d.typedLive}
                          onChange={(e) => setDrafts((s) => ({ ...s, [f.id]: { ...d, typedLive: e.target.value } }))}
                        />
                      </div>
                      <Button type="button" size="sm" onClick={() => void apply(f)}>
                        Confirm repair
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
