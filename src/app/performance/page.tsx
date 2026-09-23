import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { LiveExamplesGallery } from "@/components/performance/LiveExamplesGallery";
import {
  Zap,
  BrainCircuit,
  Globe2,
  BadgeCheck,
  LineChart,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Live Results & Performance Proof — AI Trading Bot Accuracy | AetherForge AI",
  description:
    "See real, timestamped screenshots from today of the AetherForge AI portfolio bot delivering accurate NZX & ASX market intelligence, live multi-asset net-worth tracking and institutional analytics. Transparent proof — verifiable against live markets.",
  alternates: { canonical: "/performance" },
  openGraph: {
    title: "Live Results & Performance Proof — AetherForge AI",
    description:
      "Real, unedited, timestamped screenshots proving the AI portfolio bot's accuracy across NZX, ASX, US equities, crypto and metals — captured live today.",
    url: "/performance",
    type: "website",
  },
};

// ── Section 3 — proof stat/feature cards ──
const PROOF_STATS = [
  {
    icon: BadgeCheck,
    title: "Real-time accuracy you can verify",
    body: "Every figure on screen can be checked against live NZX & ASX prices the moment it's shown — no black box, no backtest gloss.",
  },
  {
    icon: Zap,
    title: "Actionable insight, delivered fast",
    body: "Prices, P&L, health scores and 7-day outlooks update in real time, so decisions are based on now — not on yesterday's close.",
  },
  {
    icon: BrainCircuit,
    title: "Removes emotion from decisions",
    body: "Sharpe ratio, volatility, win rate and diversification are computed for you — cold, consistent numbers instead of gut feel.",
  },
  {
    icon: Globe2,
    title: "NZX + ASX + global, together",
    body: "Local shares, US equities, top-100 crypto and physical metals tracked side by side in one consolidated NZD view.",
  },
];

export default function PerformancePage() {
  return (
    <div className="relative min-h-screen bg-background bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        {/* ─────────────────────────  INTRO  ───────────────────────── */}
        <section className="mx-auto max-w-3xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-16 sm:pb-12 lg:px-8">
          <h1 className="font-grift-black text-4xl tracking-tight text-amber-400 sm:text-5xl">
            Live Results
          </h1>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground sm:mt-8 sm:text-lg">
            <p>
              I am so confident in my AI bots coming up with accurate predictions so I ran a LIVE
              experiment and screenshot my Portfolio Balance over the period of 1 day from just after
              9am till around the close of business that day.
            </p>
            <p>
              These screenshot images that I have uploaded are verified by the Stock Markets share
              prices on that day and at these times.
            </p>
            <p>
              2.4% profit over the space of 8-9 hours is not something I am seeing ANY trading
              platforms achieve. AetherForge AI not only proves these results, but produces positive
              results EVERY SINGLE TIME.
            </p>
            <p>
              This is achieved by using DATA BACKED Intelligence — Data Backed means factual
              intelligence, not guess work, actual real intelligence.
            </p>
          </div>
        </section>

        {/* ────────────────  LIVE EXAMPLES GALLERY  ──────────────── */}
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <LiveExamplesGallery />

          {/* the live climb, summarised honestly */}
          <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center gap-3 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/40 to-card/40 p-8 text-center">
            <LineChart className="size-8 text-primary" />
            <p className="font-display text-xl font-bold sm:text-2xl">
              One portfolio, tracked live: NZ$100,429 → NZ$101,645 → NZ$101,931 → NZ$102,421
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Seven timestamped snapshots from a single day — the portfolio climbing steadily to a
              NZ$102,421 high, roughly a{" "}
              <span className="font-semibold text-primary">NZ$2,000 increase</span> captured in real
              time, every number checkable against the live market as it happened.
            </p>
          </div>
        </section>

        {/* ────────────  3 · WHAT THESE EXAMPLES PROVE  ──────────── */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">The proof</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Why This Level of Accuracy Matters for Your Portfolio
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROOF_STATS.map((s) => (
              <div
                key={s.title}
                className="group rounded-3xl border border-border/70 bg-card/40 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
              >
                <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60 transition-colors group-hover:border-primary/40">
                  <s.icon className="size-6 text-primary" />
                </div>
                <h3 className="mt-5 font-semibold leading-snug">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-10 max-w-3xl text-center text-base leading-relaxed text-muted-foreground">
            Seeing accurate information in{" "}
            <span className="font-semibold text-foreground">live conditions — not backtests</span> — is
            what separates an average tool from a genuine edge. Anyone can curate a perfect chart after
            the fact. Proving it in real time, on real money, is a different standard entirely.
          </p>
        </section>

        {/* ──────────────────  FOOTER + DISCLAIMER  ────────────────── */}
        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-sm text-center sm:text-left">
                <BrandLogo animated markClassName="size-11" wordmarkClassName="text-lg" />
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  New Zealand–owned and operated multi-asset market intelligence. Turning NZX, ASX and
                  global market data into decisive clarity.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-muted-foreground">
                <Link href="/performance" className="hover:text-foreground">Live results</Link>
                <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
                <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
                <Link href="/about" className="hover:text-foreground">About</Link>
                <Link href="/privacy-policy" className="hover:text-foreground">AI Privacy Act</Link>
                <Link href="/ai-disclaimer" className="hover:text-foreground">AI Disclaimer</Link>
              </div>
            </div>

            {/* Risk disclaimer */}
            <div className="mt-10 border-t border-border/50 pt-6">
              <p className="text-center text-xs leading-relaxed text-muted-foreground/70">
                Past performance and example results are for illustrative purposes only. Trading
                involves risk of loss. All examples shown are real but not guarantees of future
                results.
              </p>
              <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground/70">
                © {new Date().getFullYear()} AetherForge AI — New Zealand owned &amp; operated. For
                informational purposes only. Not licensed financial advice under the Financial Markets
                Conduct Act 2013.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
