import type { Metadata } from "next";
import Link from "next/link";
import { getFxSnapshot } from "@/lib/fx";
import { formatUsdApprox } from "@/lib/currency";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BOT_STOX_AVATAR, BOT_KOINS_AVATAR, LOGO_MARK_IMG } from "../../../assets/files";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FolderKey,
  HardDrive,
  Lock,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Own Stox or Koins Forever — One-Time NZ$300 | AetherForge AI",
  description:
    "Get the complete self-hosted AI market intelligence bot as a downloadable package. Choose Stox (NZX/ASX stocks) or Koins (crypto). One-time NZ$300 purchase — full control, your portfolio, run independently.",
  alternates: { canonical: "/own-the-bots" },
  openGraph: {
    title: "Own Stox or Koins Forever — One-Time NZ$300 | AetherForge AI",
    description:
      "Complete self-hosted AI market intelligence bots. Stox for stocks or Koins for crypto. One-time purchase, lifetime ownership.",
    url: "/own-the-bots",
    type: "website",
  },
};

const STOX_STRIPE = "https://buy.stripe.com/bJe6oB2Afcsf0HBf1R1440m";
const KOINS_STRIPE = "https://buy.stripe.com/6oU6oB2Af63Raib2f51440n";

const RECEIVE_ITEMS = [
  {
    icon: Download,
    title: "Protected binary package",
    desc: "The complete AI intelligence engine delivered as a compiled, protected build — not readable source code. Includes double-click launchers for Windows and Mac/Linux.",
  },
  {
    icon: FolderKey,
    title: "Clear setup instructions",
    desc: "Step-by-step guide (HOW-TO-USE) covering install and first launch — you are generating reports in minutes, no coding required.",
  },
  {
    icon: Wallet,
    title: "Your portfolio, your data",
    desc: "Load your own holdings (shares, average cost, crypto quantities) via a simple CSV. Everything stays on your computer.",
  },
  {
    icon: HardDrive,
    title: "Self-hosted & offline-capable",
    desc: "Runs entirely on your machine — no account, no server connection and no subscription required to keep it running.",
  },
];

/** The self-hosted bots are a one-time NZ$300 purchase (billed in NZD via Stripe). */
const BOT_PRICE_NZD = 300;

export default async function OwnTheBotsPage() {
  // Resolve a live NZD→USD rate so the NZ$300 price can show its US$ equivalent.
  const fx = await getFxSnapshot();
  const botPriceUsd = formatUsdApprox(BOT_PRICE_NZD, fx.ratesToNZD);

  return (
    <div className="chrome-dark relative min-h-screen bg-background bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        <div className="mx-auto w-full max-w-7xl px-2 py-4 sm:px-4 sm:py-5 lg:px-6">
          <div className="content-light relative overflow-hidden rounded-2xl bg-background text-foreground shadow-[0_10px_44px_-16px_rgba(0,0,0,0.55)] ring-1 ring-black/5">
            <div className="pointer-events-none absolute inset-0 bg-aurora" />
            <div className="relative">

              {/* ─── Hero ─── */}
              <section className="mx-auto max-w-5xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-20 lg:px-8">
                <div className="mb-6 flex justify-center">
                  <span className="relative grid size-14 place-items-center rounded-2xl border border-border/70 bg-gradient-to-br from-white via-white to-slate-50 shadow-brand sm:size-16">
                    <img
                      src={LOGO_MARK_IMG}
                      alt="AetherForge AI"
                      className="h-[78%] w-[78%] object-contain"
                      draggable={false}
                    />
                  </span>
                </div>

                <Badge
                  variant="outline"
                  className="mb-5 border-amber-500/40 bg-amber-500/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-800"
                >
                  <Sparkles className="mr-1.5 size-3.5 text-amber-600" />
                  Limited Special · Lifetime Ownership
                </Badge>

                <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                  Own <span className="text-gradient">Stox</span> or{" "}
                  <span className="text-gradient">Koins</span> Forever
                </h1>
                <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  One-time NZ$300 purchase ({botPriceUsd} today). Receive the complete self-hosted AI market intelligence
                  bot as a protected, compiled package — the same engine that powers this site.
                  Add your own portfolio and run it independently, offline, with no subscription.
                </p>
              </section>

              {/* ─── Product cards ─── */}
              <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Stox */}
                  <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
                    <div className="flex flex-1 flex-col p-6 sm:p-8">
                      <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                          <div className="absolute inset-0 rounded-full bg-emerald-500/25 blur-2xl" aria-hidden />
                          <img
                            src={BOT_STOX_AVATAR}
                            alt="Stox — Stock Market Intelligence"
                            className="relative size-20 rounded-2xl object-cover ring-2 ring-emerald-500/20 sm:size-24"
                            draggable={false}
                          />
                        </div>
                        <div className="min-w-0 pt-1">
                          <h2 className="font-display text-2xl font-bold tracking-tight">Stox</h2>
                          <p className="mt-0.5 text-sm font-medium text-emerald-700">
                            Stock Market Intelligence Engine
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            Proven NZX + ASX market intelligence. Sweeps the full equity universe,
                            surfaces movers, builds institutional-grade tables and 12-month continuation
                            graphs for every ticker you monitor.
                          </p>
                        </div>
                      </div>

                      <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
                        {[
                          "Full NZX & ASX universe analysis",
                          "Live technicals, momentum & signals",
                          "Add your own share portfolio",
                          "Self-hosted — runs on your machine",
                          "Clear step-by-step setup guide included",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2.5">
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-display text-2xl font-extrabold tracking-tight">
                            NZ$300 <span className="text-base font-semibold text-muted-foreground">one-time</span>
                          </p>
                          <p className="text-xs font-medium text-muted-foreground/90">{botPriceUsd} today</p>
                          <p className="text-xs text-muted-foreground">NZD · lifetime ownership</p>
                        </div>
                        <Button
                          asChild
                          size="lg"
                          className="h-12 bg-emerald-600 px-6 text-base font-semibold text-white shadow-glow hover:bg-emerald-500"
                        >
                          <a href={STOX_STRIPE} target="_blank" rel="noopener noreferrer">
                            Purchase Stox
                            <ArrowRight className="size-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </article>

                  {/* Koins */}
                  <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500" />
                    <div className="flex flex-1 flex-col p-6 sm:p-8">
                      <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                          <div className="absolute inset-0 rounded-full bg-amber-500/25 blur-2xl" aria-hidden />
                          <img
                            src={BOT_KOINS_AVATAR}
                            alt="Koins — Crypto Market Intelligence"
                            className="relative size-20 rounded-2xl object-cover ring-2 ring-amber-500/20 sm:size-24"
                            draggable={false}
                          />
                        </div>
                        <div className="min-w-0 pt-1">
                          <h2 className="font-display text-2xl font-bold tracking-tight">Koins</h2>
                          <p className="mt-0.5 text-sm font-medium text-amber-700">
                            Crypto Market Intelligence Engine
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            Proven digital-asset intelligence. Tracks BTC, ETH and the broader crypto
                            market — synthesising funding, flows and sentiment into clear projections
                            and forward pathways.
                          </p>
                        </div>
                      </div>

                      <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
                        {[
                          "Top-100 crypto universe + news",
                          "Real movers, momentum & signals",
                          "Add your own crypto portfolio",
                          "Self-hosted — runs on your machine",
                          "Clear step-by-step setup guide included",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2.5">
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-600" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-display text-2xl font-extrabold tracking-tight">
                            NZ$300 <span className="text-base font-semibold text-muted-foreground">one-time</span>
                          </p>
                          <p className="text-xs font-medium text-muted-foreground/90">{botPriceUsd} today</p>
                          <p className="text-xs text-muted-foreground">NZD · lifetime ownership</p>
                        </div>
                        <Button
                          asChild
                          size="lg"
                          className="h-12 bg-amber-600 px-6 text-base font-semibold text-white shadow-glow hover:bg-amber-500"
                        >
                          <a href={KOINS_STRIPE} target="_blank" rel="noopener noreferrer">
                            Purchase Koins
                            <ArrowRight className="size-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </article>
                </div>
              </section>

              {/* ─── What you receive ─── */}
              <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
                <div className="rounded-3xl border border-border/70 bg-card/60 p-6 sm:p-10">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                      <ShieldCheck className="size-5" />
                    </span>
                    <div>
                      <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                        What you receive
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Everything needed to run the bot independently.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-5 sm:grid-cols-2">
                    {RECEIVE_ITEMS.map((item) => (
                      <div key={item.title} className="flex gap-3.5">
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground/80">
                          <item.icon className="size-4.5" />
                        </span>
                        <div>
                          <p className="font-semibold leading-snug">{item.title}</p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3.5 text-sm text-muted-foreground">
                    <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p>
                      The instant your payment clears you are taken to a secure confirmation page
                      where your protected package downloads automatically — plus you can
                      re-download any time. The package is yours to keep and run offline. This is
                      informational market intelligence software — not personalised financial advice.
                    </p>
                  </div>
                </div>
              </section>

              {/* ─── Secondary CTA ─── */}
              <section className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6">
                <p className="text-sm text-muted-foreground">
                  Prefer the full cloud platform with ongoing updates and The Headmaster?
                </p>
                <Button asChild variant="outline" className="mt-3">
                  <Link href="/pricing">
                    View subscription plans
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </section>

            </div>
          </div>
        </div>

        {/* Footer (dark chrome) — matches home */}
        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
              <BrandLogo markClassName="size-9" wordmarkClassName="text-base" />
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                © {new Date().getFullYear()} AetherForge AI · Forge Intelligence Ltd. One-time bot
                purchases are for informational use only and are not licensed financial advice.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}