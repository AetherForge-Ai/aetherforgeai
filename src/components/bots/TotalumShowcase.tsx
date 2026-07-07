/**
 * Home-page band introducing Totalum — the third flagship agent that
 * orchestrates Stox and Koins into one unified wealth-building system.
 * Server-safe (no client hooks). Uses the marketing copy supplied by the owner.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BOT_TOTALUM_AVATAR } from "../../../assets/files";
import {
  Compass,
  Layers,
  TrendingUp,
  ShieldAlert,
  Bot,
  FileBarChart,
  ArrowRight,
  Crown,
} from "lucide-react";

const PILLARS = [
  { icon: Layers, title: "Portfolio Synthesis", body: "Analyses your full book — stocks, crypto & metals — and engineers the optimal allocation." },
  { icon: Compass, title: "Strategy Builder", body: "Describe a goal; Totalum designs the allocation, entry/exit rules and risk parameters." },
  { icon: TrendingUp, title: "Scenario Simulator", body: "Projects bull, base and bear pathways over 7d, 30d, 90d and 12 months." },
  { icon: ShieldAlert, title: "Risk & Stress Testing", body: "Quantifies concentration, correlation and drawdown shocks — with hedges." },
  { icon: FileBarChart, title: "Intelligence Reports", body: "A Total Portfolio Intelligence Report on demand, ready to print or share." },
  { icon: Bot, title: "Chief Strategist AI", body: "“How should I rebalance if BTC drops 20%?” — answered from your live book." },
];

export function TotalumShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-violet-500/12 via-primary/10 to-transparent p-8 sm:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/15 blur-3xl" aria-hidden />

        <div className="relative">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full bg-primary/25 blur-xl" aria-hidden />
              <img
                src={BOT_TOTALUM_AVATAR}
                alt="Totalum the Architect avatar"
                className="relative size-20 rounded-2xl object-cover ring-1 ring-primary/30 sm:size-24"
              />
            </div>
            <Badge variant="outline" className="border-primary/30 bg-primary/15 text-primary">
              <Crown className="mr-1 size-3.5" /> The Master Architect
            </Badge>
          </div>
          <h2 className="mt-5 max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Meet <span className="text-gradient">Totalum</span> — Your Master Portfolio Architect
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            The ultimate AI agent that orchestrates <strong>Stox</strong> and <strong>Koins</strong> into a unified
            wealth-building system. While Stox masters equities and Koins commands crypto, Totalum sees your{" "}
            <em>entire</em> book — stocks, digital assets and precious metals — and engineers the allocation, strategy
            and risk controls to grow and protect it as one.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border/60 bg-card/50 p-5">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <p.icon className="size-5" />
                </div>
                <h3 className="mt-3 font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="font-semibold shadow-glow">
              <Link href="/pricing">
                Unlock Totalum <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              A Pro agent — included free with any active paid AetherForge membership.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TotalumShowcase;
