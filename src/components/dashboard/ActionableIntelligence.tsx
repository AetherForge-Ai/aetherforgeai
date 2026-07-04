"use client";

import { useMemo } from "react";
import type { Stock } from "@/lib/portfolio";
import { buildActionableIntelligence } from "@/lib/analytics";
import { formatMarketPrice } from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { pctClass, fmtPct, SignalBadge, MarketChip } from "@/components/dashboard/intel-ui";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Shield, Scale, Rocket } from "lucide-react";

const PATHWAY_ICON = {
  "Low Risk": Shield,
  Balanced: Scale,
  "High Risk": Rocket,
} as const;

const PATHWAY_TONE = {
  "Low Risk": "border-emerald-500/30 bg-emerald-500/5",
  Balanced: "border-primary/30 bg-primary/5",
  "High Risk": "border-orange-500/30 bg-orange-500/5",
} as const;

export function ActionableIntelligence({ stocks }: { stocks: Stock[] }) {
  const intel = useMemo(() => buildActionableIntelligence(stocks), [stocks]);
  const { actionRequired, sellRecommendations, buyCandidates, pathways } = intel;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
          <Scale className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Actionable intelligence</h2>
          <p className="text-xs text-muted-foreground">Explicit signals derived from your holdings + the model</p>
        </div>
      </div>

      {/* Immediate action banner */}
      {actionRequired ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-400" />
          <div>
            <p className="font-display font-bold text-rose-200">Immediate action required</p>
            <p className="text-sm text-rose-200/80">
              {sellRecommendations.length} holding{sellRecommendations.length === 1 ? "" : "s"} in your portfolio{" "}
              {sellRecommendations.length === 1 ? "is" : "are"} flagging elevated downside risk. Review the SELL
              recommendations below.
            </p>
          </div>
        </div>
      ) : stocks.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 px-5 py-4">
          <Shield className="mt-0.5 size-5 shrink-0 text-emerald-400" />
          <div>
            <p className="font-display font-bold text-emerald-200">No urgent exits</p>
            <p className="text-sm text-emerald-200/80">
              None of your current holdings trigger a SELL signal this session. Consider the BUY candidates below to
              deploy capital.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* SELL recommendations */}
        <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-300">
            <ArrowDownRight className="size-4" /> SELL recommendations
            <span className="text-xs font-normal text-muted-foreground">(from your holdings)</span>
          </div>
          {sellRecommendations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No holdings currently flag a sell signal. 🎯
            </p>
          ) : (
            <div className="space-y-3">
              {sellRecommendations.map((r) => (
                <div key={r.ticker} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold">{r.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                      <SignalBadge signal={r.signal} />
                      {r.urgency === "high" && (
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-rose-300">
                          Urgent
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-medium">{formatMarketPrice(r.price, "USD")}</p>
                      <p className="text-[0.62rem] text-muted-foreground">
                        {r.weight}% wt · <span className={pctClass(r.gainPct)}>{fmtPct(r.gainPct)}</span> P&amp;L
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">{r.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BUY candidates */}
        <div className="rounded-2xl border border-border/70 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <ArrowUpRight className="size-4" /> High-conviction BUY candidates
            <span className="text-xs font-normal text-muted-foreground">(not held)</span>
          </div>
          {buyCandidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No fresh buy signals right now.</p>
          ) : (
            <div className="space-y-3">
              {buyCandidates.map((c) => (
                <div key={c.ticker} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-sm font-bold">{c.ticker.replace(/\.(NZ|AX)$/, "")}</span>
                      <MarketChip market={c.market} />
                      <SignalBadge signal={c.signal} />
                    </div>
                    <div className="text-right">
                      <p className="tnum text-sm font-medium">{formatMarketPrice(c.price, c.currency)}</p>
                      <p className="text-[0.62rem] text-muted-foreground">
                        <span className={pctClass(c.projected7dPct)}>{fmtPct(c.projected7dPct)}</span> · {c.confidence}% conf.
                      </p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">{c.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Forward pathways */}
      <div>
        <p className="mb-3 text-sm font-semibold">Three forward pathways</p>
        <div className="grid gap-4 md:grid-cols-3">
          {pathways.map((p) => {
            const Icon = PATHWAY_ICON[p.risk];
            return (
              <div key={p.name} className={cn("rounded-2xl border p-5", PATHWAY_TONE[p.risk])}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-display font-bold">
                    <Icon className="size-4" /> {p.name}
                  </span>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[0.62rem] font-semibold text-muted-foreground">
                    {p.risk}
                  </span>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <div>
                    <p className="text-[0.62rem] uppercase text-muted-foreground">7-day target</p>
                    <p className={cn("tnum font-display text-xl font-bold", pctClass(p.targetPct))}>{fmtPct(p.targetPct)}</p>
                  </div>
                  <div>
                    <p className="text-[0.62rem] uppercase text-muted-foreground">Probability</p>
                    <p className="tnum font-display text-xl font-bold">{p.probability}%</p>
                  </div>
                </div>
                <p className="mt-3 text-[0.72rem] text-muted-foreground">{p.summary}</p>
                <ul className="mt-3 space-y-1.5">
                  {p.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[0.72rem] text-foreground/80">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[0.68rem] italic text-muted-foreground">
          Informational market intelligence only — not personalised financial advice.
        </p>
      </div>
    </section>
  );
}
