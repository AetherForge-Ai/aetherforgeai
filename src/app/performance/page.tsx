import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { LiveExamplesGallery } from "@/components/performance/LiveExamplesGallery";
import {
  ArrowRight,
  ChevronDown,
  ShieldCheck,
  Gauge,
  Zap,
  BrainCircuit,
  Globe2,
  ShieldAlert,
  Target,
  BadgeCheck,
  LineChart,
  CheckCircle2,
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

// ── Section 4 — the real advantage ──
const ADVANTAGES = [
  {
    icon: ShieldAlert,
    title: "Avoid costly mistakes",
    body: "Know your true cost basis, exposure and risk before you act — so a rushed decision never quietly erodes your capital.",
  },
  {
    icon: Target,
    title: "Catch opportunities earlier",
    body: "Live movement, momentum and a forward 7-day outlook surface shifts while they still matter — not after the move is gone.",
  },
  {
    icon: Gauge,
    title: "Trade with confidence, backed by data",
    body: "Institutional-grade analytics on your own holdings mean every choice is anchored to evidence you can point to.",
  },
];

export default function PerformancePage() {
  return (
    <div className="relative min-h-screen bg-background bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        {/* ─────────────────────────  1 · HERO  ───────────────────────── */}
        <section className="relative mx-auto max-w-5xl px-4 pt-16 pb-14 text-center sm:px-6 lg:px-8 lg:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="size-3.5" /> Live · Unedited · Timestamped
          </p>
          <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Real Proof. <span className="text-primary">Real Accuracy.</span>
            <br className="hidden sm:block" /> Real{" "}
            <span className="text-gradient">Profits.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Live, unedited screenshots from today showing the AI bot delivering precise market
            information and clear profit opportunities in real time.
          </p>
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <BadgeCheck className="size-3.5 text-primary" /> Every example is timestamped and
            verifiable against live NZX &amp; ASX market data.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
              <Link href="/register">
                Start Using the Bot <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
              <a href="#live-examples">
                See How It Works <ChevronDown className="ml-1 size-4" />
              </a>
            </Button>
          </div>

          {/* subtle ticker-style trust row */}
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["4 markets", "NZX · ASX · US · Crypto"],
              ["Live FX", "True NZD net worth"],
              ["Real-time", "Analytics & alerts"],
              ["0 edits", "Raw screenshots"],
            ].map(([big, small]) => (
              <div
                key={big}
                className="rounded-2xl border border-border/60 bg-card/30 px-4 py-3 backdrop-blur"
              >
                <div className="font-display text-sm font-bold text-primary">{big}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{small}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ────────────────  2 · TODAY'S LIVE EXAMPLES  ──────────────── */}
        <section id="live-examples" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              Today&apos;s live examples
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Screenshots from Today — See the Accuracy Yourself
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              These are real interactions with the AI Portfolio Monitoring Bot captured today. Notice
              how the information is precise, timely, and directly useful for making profitable
              decisions.
            </p>
            <p className="mt-3 text-sm text-muted-foreground/80">
              Tip: tap any screenshot to open a larger, zoomable view.
            </p>
          </div>

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

        {/* ──────────────  4 · THE REAL ADVANTAGE  ────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">
              The real advantage
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Accurate Information = Better Decisions = Real Money
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {ADVANTAGES.map((a) => (
              <div
                key={a.title}
                className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-8"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
                <div className="relative">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                    <a.icon className="size-6 text-primary" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold">{a.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ──────────────────  5 · FINAL CTA  ────────────────── */}
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card/60 to-card/60 px-6 py-16 text-center shadow-glow sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-aurora opacity-60" />
            <div className="relative">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-background/60">
                <Target className="size-7 text-primary" />
              </div>
              <h2 className="mx-auto mt-6 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to Put This Edge to Work in Your Portfolio?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                Join AetherForge AI and turn live NZX, ASX and global market data into decisive,
                evidence-based clarity — starting today.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
                  <Link href="/register">
                    Get Started with the Bot <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                  <Link href="/how-it-works">Book a Quick Demo</Link>
                </Button>
              </div>
              <p className="mt-7 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-primary" /> Built for serious investors.
                Transparent. No fluff.
              </p>
            </div>
          </div>
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
