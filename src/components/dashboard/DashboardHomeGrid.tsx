"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { AnimatedMoney } from "@/components/dashboard/AnimatedMoney";
import { IndexMarketCard } from "@/components/dashboard/IndexMarketCard";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { ArrowRight, BookOpen, Coins, Landmark, Wallet, Sparkles, Bot, GraduationCap } from "lucide-react";

type LedgerRow = {
  type?: string;
  ticker?: string | null;
  amount?: number | null;
  executed_at?: string | null;
  notes?: string | null;
};

type Props = {
  cashBalance: number;
  stockTotalNZD: number;
  cryptoTotalNZD: number;
  metalsTotalNZD: number;
  stockPositions: number;
  cryptoPositions: number;
  metalsPositions: number;
  recentLedger?: LedgerRow[];
  className?: string;
};

function BalanceCard({
  title,
  href,
  value,
  sub,
  icon: Icon,
  highlight,
}: {
  title: string;
  href: string;
  value: number;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[8.5rem] flex-col rounded-2xl border bg-card/70 p-4 shadow-sm transition-colors hover:border-primary/45 hover:bg-card",
        highlight
          ? "border-primary/40 bg-gradient-to-br from-primary/15 via-card/70 to-card/50"
          : "border-border/70"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-grift-black text-sm uppercase tracking-wide text-amber-400 sm:text-base">
          {title}
        </h3>
        <Icon className="size-4 shrink-0 text-primary/80" />
      </div>
      <AnimatedMoney
        value={value}
        currency="NZD"
        className="tnum mt-3 font-display text-xl font-bold text-emerald-600 sm:text-2xl"
      />
      {sub ? (
        <p className="mt-auto pt-2 text-xs text-muted-foreground">{sub}</p>
      ) : (
        <span className="mt-auto" />
      )}
      <span className="mt-2 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-primary">
        Open <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

function OverviewCard({
  title,
  href,
  bot,
  poster,
  metricLabel,
  metricValue,
  hint,
  sceneSrc,
}: {
  title: string;
  href: string;
  bot: "stox" | "koins" | "headmaster" | "smitty";
  poster: string;
  metricLabel: string;
  metricValue: string;
  hint: string;
  sceneSrc?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[16.5rem] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-card"
    >
      <h3 className="relative z-10 font-grift-black text-sm uppercase tracking-wide text-amber-400 sm:text-[0.95rem]">
        {title}
      </h3>
      <p className="relative z-10 mt-2 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
        {metricLabel}
      </p>
      <p className="relative z-10 tnum font-display text-lg font-bold text-emerald-600">
        {metricValue}
      </p>
      <p className="relative z-10 mt-1 text-xs text-muted-foreground">{hint}</p>

      <div className="relative z-10 mt-auto flex items-end justify-center pt-2">
        {sceneSrc ? (
          <div className="relative h-36 w-full max-w-[11rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sceneSrc}
              alt=""
              aria-hidden
              className="absolute inset-x-0 bottom-0 mx-auto h-16 w-auto object-contain opacity-90"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={poster}
              alt=""
              className="relative mx-auto h-32 w-auto object-contain object-bottom"
            />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className="h-36 w-auto object-contain object-bottom"
          />
        )}
      </div>
      <span className="relative z-10 mt-2 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-primary">
        Open page <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

function LedgerCard({
  href,
  rows,
  cashBalance,
}: {
  href: string;
  rows: LedgerRow[];
  cashBalance: number;
}) {
  const latest = rows.slice(0, 4);
  return (
    <Link
      href={href}
      className="flex min-h-[16.5rem] flex-col rounded-2xl border border-border/70 bg-card/70 p-4 text-left shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-grift-black text-sm uppercase tracking-wide text-amber-400 sm:text-[0.95rem]">
          Transaction Ledger
        </h3>
        <BookOpen className="size-4 text-primary/80" />
      </div>
      <p className="mt-2 text-[0.7rem] uppercase tracking-wider text-muted-foreground">
        Cash on hand
      </p>
      <p className="tnum font-display text-lg font-bold text-emerald-600">
        {formatMoney(cashBalance, "NZD")}
      </p>

      <ul className="mt-3 flex-1 space-y-1.5">
        {latest.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
            No trades yet — buys, sells, deposits and withdrawals land here.
          </li>
        ) : (
          latest.map((r, i) => (
            <li
              key={`${r.executed_at ?? i}-${r.ticker ?? r.type}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 text-xs"
            >
              <span className="font-semibold uppercase text-primary">
                {r.type || "txn"}
              </span>
              <span className="truncate text-muted-foreground">
                {r.ticker || r.notes || "—"}
              </span>
              <span className="tnum shrink-0 font-medium text-foreground">
                {r.amount != null ? formatMoney(Math.abs(r.amount), "NZD") : "—"}
              </span>
            </li>
          ))
        )}
      </ul>
      <span className="mt-2 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-primary">
        Open ledger <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

/**
 * Dashboard home 4×3 grid. Every window links to its own detail page.
 */
export function DashboardHomeGrid({
  cashBalance,
  stockTotalNZD,
  cryptoTotalNZD,
  metalsTotalNZD,
  stockPositions,
  cryptoPositions,
  metalsPositions,
  recentLedger = [],
  className,
}: Props) {
  return (
    <div className={cn("mt-6 space-y-4", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BalanceCard
          title="Cash Bal"
          href="/dashboard/cash"
          value={cashBalance}
          sub="Available for buys · NZD"
          icon={Wallet}
          highlight
        />
        <BalanceCard
          title="Value in Stocks NZD"
          href="/dashboard/stocks"
          value={stockTotalNZD}
          sub={`${stockPositions} position${stockPositions === 1 ? "" : "s"}`}
          icon={Landmark}
        />
        <BalanceCard
          title="Value in Crypto NZD"
          href="/dashboard/crypto"
          value={cryptoTotalNZD}
          sub={`${cryptoPositions} coin${cryptoPositions === 1 ? "" : "s"}`}
          icon={Coins}
        />
        <BalanceCard
          title="Value in Metals NZD"
          href="/dashboard/metals"
          value={metalsTotalNZD}
          sub={
            metalsPositions > 0
              ? `${metalsPositions} metal holding${metalsPositions === 1 ? "" : "s"}`
              : "Gold & silver spot sleeve"
          }
          icon={Coins}
        />
      </div>

      <p className="text-center text-[0.7rem] text-muted-foreground sm:text-left">
        Cash Bal and the value boxes update from the same Transaction Ledger as{" "}
        <Link href="/dashboard/transactions" className="font-semibold text-primary underline-offset-2 hover:underline">
          Transactions
        </Link>
        {" "}— every buy, sell, deposit and withdraw.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="Stock Portfolio Overview"
          href="/dashboard/stocks"
          bot="stox"
          poster="/brand/bot-stox-fullbody.png"
          metricLabel="Market value · NZD"
          metricValue={formatMoney(stockTotalNZD, "NZD")}
          hint="Stox watches NZX · ASX · US equities for you"
        />
        <OverviewCard
          title="Crypto Portfolio Overview"
          href="/dashboard/crypto"
          bot="koins"
          poster="/brand/bot-koins-fullbody.png"
          metricLabel="Market value · NZD"
          metricValue={formatMoney(cryptoTotalNZD, "NZD")}
          hint="Koins tracks BTC, ETH and your coin book"
        />
        <OverviewCard
          title="Precious Metals Overview"
          href="/dashboard/metals"
          bot="smitty"
          poster="/brand/bot-smitty-fullbody.png"
          metricLabel="Metals value · NZD"
          metricValue={formatMoney(metalsTotalNZD, "NZD")}
          hint="Smitty with live gold & silver at the forge"
        />
        <LedgerCard
          href="/dashboard/transactions"
          rows={recentLedger}
          cashBalance={cashBalance}
        />
      </div>

      
      {/* Run the AI bots — Stox, Koins, The Headmaster */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/70 to-card/50 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-grift-black text-sm uppercase tracking-wide text-amber-400 sm:text-base">
              Run the AI bots
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate Stox &amp; Koins market reports, or open The Headmaster to build your plan and strategy.
            </p>
          </div>
          <Link
            href="/dashboard/bots"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Open bot desk <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/dashboard/bots#dash-report-centre"
            className="flex flex-col rounded-xl border border-border/70 bg-card/80 p-4 transition-colors hover:border-primary/45"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bot-stox-fullbody.png" alt="" className="mx-auto h-24 w-auto object-contain" />
            <p className="mt-2 font-grift-black text-center text-sm uppercase text-amber-400">Stox</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">Run stock-market ULTRA reports</p>
            <span className="mt-3 inline-flex items-center justify-center gap-1 text-[0.7rem] font-semibold text-primary">
              <Bot className="size-3.5" /> Run Stox
            </span>
          </Link>
          <Link
            href="/dashboard/bots#dash-report-centre"
            className="flex flex-col rounded-xl border border-border/70 bg-card/80 p-4 transition-colors hover:border-primary/45"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bot-koins-fullbody.png" alt="" className="mx-auto h-24 w-auto object-contain" />
            <p className="mt-2 font-grift-black text-center text-sm uppercase text-amber-400">Koins</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">Run crypto-market ULTRA reports</p>
            <span className="mt-3 inline-flex items-center justify-center gap-1 text-[0.7rem] font-semibold text-primary">
              <Sparkles className="size-3.5" /> Run Koins
            </span>
          </Link>
          <Link
            href="/headmaster"
            className="flex flex-col rounded-xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:border-primary/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/bot-headmaster-fullbody.png" alt="" className="mx-auto h-24 w-auto object-contain" />
            <p className="mt-2 font-grift-black text-center text-sm uppercase text-amber-400">The Headmaster</p>
            <p className="mt-1 text-center text-xs text-muted-foreground">Create your plan &amp; strategy</p>
            <span className="mt-3 inline-flex items-center justify-center gap-1 text-[0.7rem] font-semibold text-primary">
              <GraduationCap className="size-3.5" /> Open Headmaster
            </span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/dashboard/markets/nzsx" className="block transition-opacity hover:opacity-95">
          <IndexMarketCard title="NZSX" exchange="NZX" />
        </Link>
        <Link href="/dashboard/markets/asx" className="block transition-opacity hover:opacity-95">
          <IndexMarketCard title="ASX" exchange="ASX" />
        </Link>
        <Link href="/dashboard/markets/nasdaq" className="block transition-opacity hover:opacity-95">
          <IndexMarketCard title="NASDAQ" exchange="NASDAQ" />
        </Link>
        <Link href="/dashboard/markets/dow" className="block transition-opacity hover:opacity-95">
          <IndexMarketCard title="Dow Jones" exchange="DOW" />
        </Link>
      </div>
    </div>
  );
}

export default DashboardHomeGrid;
