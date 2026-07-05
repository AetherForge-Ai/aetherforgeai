import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  LineChart,
  TrendingUp,
  Bitcoin,
  UserPlus,
  Wallet,
  FileBarChart,
  ListChecks,
  ShieldCheck,
  KeyRound,
  Newspaper,
  Activity,
  GaugeCircle,
  Route,
  BarChart3,
  CircleDollarSign,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works — AetherForge AI",
  description:
    "How AetherForge AI turns NZX, ASX, US market and global crypto data into institutional-grade, plain-English intelligence — powered by SuperGrok 4.3 in full Apex State.",
};

const BOTS = [
  {
    icon: TrendingUp,
    name: "Stox",
    subtitle: "Stock Market Intelligence Monitor",
    accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
    ring: "border-emerald-500/30",
    desc: "Sweeps the entire NZX and ASX plus global equities — compiling institutional-grade market tables, top-mover boards and 12-month continuation graphs for every ticker you hold.",
    tags: ["NZX", "ASX", "US & global equities"],
  },
  {
    icon: Bitcoin,
    name: "Koins",
    subtitle: "Crypto Market Intelligence Monitor",
    accent: "from-amber-500/20 via-orange-500/10 to-transparent",
    ring: "border-amber-500/30",
    desc: "Tracks the top 100 cryptocurrencies and the broader digital-asset market — synthesising funding, flows, worldwide news and sentiment into clear 7-day projections and forward pathways.",
    tags: ["BTC", "ETH", "Top-100 digital assets"],
  },
];

const STEPS = [
  {
    n: "01",
    icon: UserPlus,
    title: "Subscribe & log in",
    body: "Create your account and pick a plan, then access your secure, private Dashboard. New here? You can run one full report free before you subscribe.",
  },
  {
    n: "02",
    icon: Wallet,
    title: "Manage your portfolio",
    body: "Your holdings sit at the top of your Dashboard. Add, remove or edit tickers below — e.g. ATM.NZ, CPU.AX, BTC, ETH. Blank portfolios stay blank: tickers are only ever added or removed by you.",
  },
  {
    n: "03",
    icon: FileBarChart,
    title: "Receive daily Apex reports",
    body: "The Stock and Crypto monitors analyse your holdings and deliver a full Apex-State Portfolio Intelligence Report — to your dashboard and your inbox, downloadable as a PDF.",
  },
  {
    n: "04",
    icon: ListChecks,
    title: "Follow a clear action plan",
    body: "Every report ends with a simple, step-by-step action plan written in plain English, so you always know exactly what to consider next.",
  },
];

const REPORT_CONTENTS = [
  { icon: BarChart3, label: "Live NZX, ASX & US market tables" },
  { icon: CircleDollarSign, label: "Your exact portfolio value & P&L" },
  { icon: Newspaper, label: "Impact-tagged latest news" },
  { icon: Activity, label: "Top movers — 24h / 7d / 30d" },
  { icon: GaugeCircle, label: "7-day price projections with confidence scores & technicals" },
  { icon: LineChart, label: "Embedded 12-month continuation charts" },
  { icon: TrendingUp, label: "Recommended moves" },
  { icon: Route, label: "Three forward pathways — Low Risk · Balanced · High Risk" },
];

export default function HowItWorksPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-10 text-center sm:px-6 lg:px-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <LineChart className="size-3.5" /> Powered by SuperGrok 4.3 · Apex State
          </p>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            How AetherForge AI works
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Two purpose-built AI monitors run an exhaustive multi-timeframe sweep across your markets and
            deliver institutional-grade insight — so you make smarter decisions without spending all day on
            research.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
              <Link href="/register">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
              <Link href="/#bots">
                View sample report <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* The two bots */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Two ultra-advanced bots, one Apex State
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built from the ground up and running on SuperGrok 4.3, each monitor is an institutional-grade
              analyst working around the clock on your holdings.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {BOTS.map((bot) => (
              <div
                key={bot.name}
                className={`relative overflow-hidden rounded-3xl border ${bot.ring} bg-card/40 p-8`}
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${bot.accent}`} />
                <div className="relative">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                    <bot.icon className="size-6 text-primary" />
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold">{bot.name}</h3>
                  <p className="text-sm font-medium text-primary/90">{bot.subtitle}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{bot.desc}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {bot.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-border/70 bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Step-by-step experience */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Step by step</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              From sign-up to insight in minutes
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-3xl border border-border/70 bg-card/40 p-6">
                <div className="flex items-center justify-between">
                  <span className="font-display text-4xl font-extrabold text-primary/25">{s.n}</span>
                  <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60">
                    <s.icon className="size-5 text-primary" />
                  </div>
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What's inside every report */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-card/60 p-8 sm:p-12">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                  Apex Portfolio Intelligence Report
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  What lands in your inbox
                </h2>
              </div>
              <Button asChild variant="outline">
                <Link href="/#bots">
                  See a sample <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {REPORT_CONTENTS.map((c) => (
                <div
                  key={c.label}
                  className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/40 p-4"
                >
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <c.icon className="size-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{c.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security & disclaimers */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-border/70 bg-card/40 p-8">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                <KeyRound className="size-6 text-primary" />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold">Forgot your password?</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Use the <span className="font-semibold text-foreground">“Forgot password?”</span> link on the
                sign-in page. Enter your email and we&apos;ll send a secure link to set a new password — it
                expires in one hour.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link href="/forgot-password">
                  Reset my password <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>

            <div className="rounded-3xl border border-border/70 bg-card/40 p-8">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                <ShieldCheck className="size-6 text-primary" />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold">Security & disclaimers</h3>
              <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  AetherForge AI is not a trading platform — you control all trades on your chosen exchange.
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  Not financial advice. All insights are AI-generated from public market data.
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  Every position, report and conversation is scoped privately to your account.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card/60 to-card/60 px-8 py-14 text-center shadow-glow sm:px-12">
            <LineChart className="mx-auto size-10 text-primary" />
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to put an AI analyst to work?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Join AetherForge AI and turn NZX, ASX and global market data into decisive clarity today.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
                <Link href="/register">Get started free</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                <Link href="/pricing">View pricing</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
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
                <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
                <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
                <Link href="/login" className="hover:text-foreground">Log in</Link>
                <Link href="/register" className="hover:text-foreground">Sign up</Link>
                <Link href="/privacy-policy" className="hover:text-foreground">AI Privacy Act</Link>
                <Link href="/ai-disclaimer" className="hover:text-foreground">AI Disclaimer</Link>
              </div>
            </div>
            <div className="mt-10 border-t border-border/50 pt-6 text-center text-xs leading-relaxed text-muted-foreground">
              <p>
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
