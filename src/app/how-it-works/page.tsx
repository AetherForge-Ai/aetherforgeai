import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { CryptoInfoModal } from "@/components/how-it-works/CryptoInfoModal";
import {
  ArrowRight,
  ExternalLink,
  LineChart,
  TrendingUp,
  Bitcoin,
  Wallet,
  FileBarChart,
  ListChecks,
  ShieldCheck,
  Lock,
  GaugeCircle,
  Route,
  BarChart3,
  Building2,
  Coins,
  Bell,
  Bot,
  KeySquare,
  Landmark,
  ShoppingCart,
  Sparkles,
  Store,
  BadgeCheck,
  History,
  Layers,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works — AetherForge AI",
  description:
    "You buy your shares, crypto, gold and silver through your own broker — AetherForge AI never touches your assets. See the exact step-by-step process, what each AI report contains, where to buy, and plain-English guides to shares, crypto and precious metals.",
  alternates: { canonical: "/how-it-works" },
};

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const OVERVIEW_PILLARS = [
  {
    icon: ShoppingCart,
    title: "You buy — anywhere you like",
    body: "Purchase your shares, crypto, gold or silver through any broker or exchange you already trust. Nothing about your buying changes.",
  },
  {
    icon: Lock,
    title: "You keep full custody",
    body: "Your assets stay in your own accounts. AetherForge never holds, moves or has access to your money or holdings — ever.",
  },
  {
    icon: Bot,
    title: "We analyse & advise",
    body: "You enter what you own; our Stox and Koins bots study the markets and hand you clear, plain-English guidance and reports.",
  },
];

const STEPS = [
  {
    n: "01",
    icon: ShoppingCart,
    title: "Buy your assets elsewhere",
    body: "Purchase your shares, crypto, gold or silver through your chosen platform — Sharesies, Tiger Trade, Interactive Brokers, an exchange or a bullion dealer.",
  },
  {
    n: "02",
    icon: LineChart,
    title: "Open your Dashboard",
    body: "Log in to AetherForge AI and head to your private Dashboard — your command centre for everything you hold.",
  },
  {
    n: "03",
    icon: Wallet,
    title: "Enter your investment details",
    body: "Add each holding: the ticker code (e.g. BTC, FPH.NZ), the number of shares or units you bought, and the price you paid per unit.",
  },
  {
    n: "04",
    icon: Bell,
    title: "Set alerts on your holdings",
    body: "Add smart alerts — Hard Sell levels, Trim % targets and more — so you're notified the moment a position hits a threshold that matters to you.",
  },
  {
    n: "05",
    icon: KeySquare,
    title: "Run Totalum — The Architect",
    body: "Let Totalum build a personalised plan across your whole portfolio, tuned to your goals and risk tolerance — equities and crypto considered together.",
  },
  {
    n: "06",
    icon: Bot,
    title: "Run Stox or Koins",
    body: "Fire up the Stox bot for shares or the Koins bot for crypto. Each runs an exhaustive, multi-timeframe sweep of your markets.",
  },
  {
    n: "07",
    icon: FileBarChart,
    title: "Receive your AI report",
    body: "Get a comprehensive, analyst-grade report — delivered to your dashboard and inbox, downloadable as a PDF, with clear recommended moves.",
  },
];

const REPORT_CONTENTS = [
  { icon: BarChart3, label: "Complete market breakdown", desc: "Live NZX, ASX, US and global tables with the context around every ticker you hold." },
  { icon: TrendingUp, label: "What has performed well", desc: "Your top movers surfaced and ranked across 24h, 7-day and 30-day windows." },
  { icon: LineChart, label: "Performance graphs", desc: "Clean 12-month history and continuation charts embedded right in the report." },
  { icon: GaugeCircle, label: "7-day projected outlook", desc: "Forward projections with confidence scores, momentum and continuation graphs." },
  { icon: ListChecks, label: "Clear recommended moves", desc: "Plain-English Sell / Hold / Buy calls — each with the detailed reasoning behind it." },
  { icon: Route, label: "Three pathways forward", desc: "Low Risk · Balanced · High Risk routes so you choose the path that fits you." },
];

const BOTS = [
  {
    icon: TrendingUp,
    name: "Stox",
    subtitle: "Stock Market Intelligence",
    accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
    ring: "border-emerald-500/30",
    desc: "Sweeps the entire NZX and ASX plus global equities — compiling institutional-grade tables, top-mover boards and 12-month continuation graphs for every share you hold.",
    tags: ["NZX", "ASX", "US & global equities"],
  },
  {
    icon: Bitcoin,
    name: "Koins",
    subtitle: "Crypto Market Intelligence",
    accent: "from-amber-500/20 via-orange-500/10 to-transparent",
    ring: "border-amber-500/30",
    desc: "Tracks the top 100 cryptocurrencies and the wider digital-asset market — synthesising flows, worldwide news and sentiment into clear 7-day projections and forward pathways.",
    tags: ["BTC", "ETH", "Top-100 digital assets"],
  },
];

interface Platform {
  name: string;
  tag: string;
  region: string;
  desc: string;
  url: string;
  mono: string;
  accent: string; // tailwind gradient
}

const STOCK_PLATFORMS: Platform[] = [
  {
    name: "Sharesies",
    tag: "Beginner-friendly · NZ & US shares",
    region: "New Zealand",
    desc: "A hugely popular New Zealand platform that lets you buy NZX, ASX and US shares and ETFs with as little as one cent. Simple, mobile-first and ideal for first-time investors.",
    url: "https://www.sharesies.nz",
    mono: "S",
    accent: "from-orange-500/20 to-transparent",
  },
  {
    name: "Tiger Trade",
    tag: "Low-cost · global markets",
    region: "NZ / Global",
    desc: "Tiger Brokers' app gives you low-fee access to US, Australian, Hong Kong and NZ shares, options and ETFs, with fast execution and advanced charting for more active investors.",
    url: "https://www.tigerbrokers.nz",
    mono: "T",
    accent: "from-sky-500/20 to-transparent",
  },
  {
    name: "Interactive Brokers",
    tag: "Professional-grade · 150+ markets",
    region: "Global",
    desc: "A trusted global broker used by professionals, offering shares, ETFs, options, futures and bonds across 150+ markets worldwide with institutional pricing and deep tooling.",
    url: "https://www.interactivebrokers.com",
    mono: "IB",
    accent: "from-red-500/20 to-transparent",
  },
  {
    name: "Hatch",
    tag: "US shares & ETFs · NZ-based",
    region: "New Zealand",
    desc: "A New Zealand favourite for accessing thousands of US-listed shares and ETFs in NZD, with a clean, approachable experience built for long-term investors.",
    url: "https://www.hatchinvest.nz",
    mono: "H",
    accent: "from-violet-500/20 to-transparent",
  },
];

const CRYPTO_PLATFORMS: Platform[] = [
  {
    name: "Easy Crypto",
    tag: "NZ-owned · buy in NZD",
    region: "New Zealand",
    desc: "A New Zealand-owned service that makes buying and selling major cryptocurrencies in NZD straightforward, sending coins straight to your own wallet for true self-custody.",
    url: "https://easycrypto.com/nz",
    mono: "EC",
    accent: "from-emerald-500/20 to-transparent",
  },
  {
    name: "Kraken",
    tag: "Established · security-focused",
    region: "Global",
    desc: "One of the longest-running global exchanges, known for strong security and a broad selection of coins. Suits investors who want depth and reliability.",
    url: "https://www.kraken.com",
    mono: "K",
    accent: "from-indigo-500/20 to-transparent",
  },
  {
    name: "Coinbase",
    tag: "Beginner-friendly · listed company",
    region: "Global",
    desc: "A publicly listed US exchange with a simple interface that's popular with newcomers. Buy, sell and hold hundreds of digital assets with a familiar, guided flow.",
    url: "https://www.coinbase.com",
    mono: "C",
    accent: "from-blue-500/20 to-transparent",
  },
];

const METAL_PLATFORMS: Platform[] = [
  {
    name: "New Zealand Mint",
    tag: "Physical gold & silver · NZ",
    region: "New Zealand",
    desc: "New Zealand's only precious-metals mint, selling investment-grade gold and silver bullion bars and coins with local delivery and secure storage options.",
    url: "https://www.nzmint.com",
    mono: "NZ",
    accent: "from-amber-500/20 to-transparent",
  },
  {
    name: "MyGold",
    tag: "Bullion dealer · NZ",
    region: "New Zealand",
    desc: "A New Zealand bullion dealer offering gold and silver bars and coins at competitive margins, with buy-back options and vaulted storage for larger holdings.",
    url: "https://mygold.co.nz",
    mono: "MG",
    accent: "from-yellow-500/20 to-transparent",
  },
  {
    name: "BullionStar",
    tag: "Global bullion & vaulting",
    region: "Global",
    desc: "An international bullion dealer with transparent live pricing on gold and silver, plus insured vault storage — useful for investors wanting scale and global reach.",
    url: "https://www.bullionstar.com",
    mono: "BS",
    accent: "from-orange-500/20 to-transparent",
  },
];

const BUY_GUIDES = [
  {
    icon: Building2,
    title: "How to buy & sell shares",
    color: "text-emerald-600",
    steps: [
      "Open an account with a broker like Sharesies, Tiger Trade or Interactive Brokers and verify your identity.",
      "Deposit funds from your bank, then search for a company by its ticker (e.g. FPH.NZ, AAPL).",
      "Place a buy order for the number of shares — or dollar amount — you want, and confirm.",
      "To sell later, place a sell order; proceeds settle back to your account, ready to withdraw.",
    ],
  },
  {
    icon: Coins,
    title: "How to buy cryptocurrency",
    color: "text-amber-600",
    steps: [
      "Create an account on an exchange such as Easy Crypto, Kraken or Coinbase and complete verification.",
      "Deposit NZD (or your local currency) via bank transfer or card.",
      "Choose a coin (e.g. BTC, ETH), enter an amount, and confirm the purchase.",
      "For maximum control, withdraw coins to your own wallet — “not your keys, not your coins”.",
    ],
  },
  {
    icon: Landmark,
    title: "How to buy gold & silver",
    color: "text-yellow-600",
    steps: [
      "Choose physical bullion (bars/coins) from a dealer like the NZ Mint, MyGold or BullionStar.",
      "Compare the price against the live spot rate plus the dealer's premium.",
      "Buy and arrange insured delivery to you, or secure vaulted storage with the dealer.",
      "Track your holdings in AetherForge by entering the units and price you paid.",
    ],
  },
];

const STOCK_HISTORY = [
  {
    era: "1600s",
    title: "The first shares",
    body: "The Dutch East India Company issued the world's first tradeable shares in 1602, letting ordinary people own a slice of a business and share in its profits. The Amsterdam exchange was born to trade them.",
  },
  {
    era: "1790s",
    title: "Wall Street forms",
    body: "In 1792, 24 brokers signed the Buttonwood Agreement under a tree on Wall Street — the seed of the New York Stock Exchange and modern organised markets.",
  },
  {
    era: "1900s",
    title: "Markets go mainstream",
    body: "Exchanges spread worldwide, including the NZX in New Zealand. Shares became a primary way for companies to raise capital and for households to build long-term wealth.",
  },
  {
    era: "Today",
    title: "Anyone can invest",
    body: "Low-cost apps put NZX, ASX and global markets in everyone's pocket. The challenge shifted from access to clarity — which is exactly where AI-driven analysis now helps.",
  },
];

const CRYPTO_HISTORY = [
  {
    era: "2009",
    title: "Bitcoin is born",
    body: "After the financial crisis, an anonymous creator launched Bitcoin — money secured by cryptography and maintained by a global network rather than any bank.",
  },
  {
    era: "2015",
    title: "Programmable money",
    body: "Ethereum added smart contracts, letting developers build applications — lending, trading, digital ownership — directly on a blockchain.",
  },
  {
    era: "2020s",
    title: "Institutions arrive",
    body: "Major funds, listed companies and payment firms began holding and offering crypto, and spot ETFs brought it into mainstream portfolios.",
  },
  {
    era: "Now",
    title: "A recognised asset class",
    body: "Digital assets sit alongside shares and metals as a distinct, if volatile, asset class — one the Koins bot analyses in depth for you.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Small presentational helpers                                              */
/* -------------------------------------------------------------------------- */

function PlatformCard({ p }: { p: Platform }) {
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow"
    >
      <div className={`pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-gradient-to-br ${p.accent} blur-2xl`} aria-hidden />
      <div className="relative flex items-center justify-between">
        <span className="grid size-12 place-items-center rounded-2xl border border-border/70 bg-background/70 font-display text-lg font-extrabold text-foreground">
          {p.mono}
        </span>
        <span className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {p.region}
        </span>
      </div>
      <h4 className="relative mt-4 font-display text-lg font-bold">{p.name}</h4>
      <p className="relative mt-0.5 text-xs font-semibold text-primary/90">{p.tag}</p>
      <p className="relative mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{p.desc}</p>
      <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors group-hover:text-primary">
        Visit {p.name} <ExternalLink className="size-3.5" />
      </span>
    </a>
  );
}

function Timeline({ items }: { items: { era: string; title: string; body: string }[] }) {
  return (
    <div className="relative mt-8 space-y-6 pl-6 before:absolute before:left-1.5 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border/70">
      {items.map((it) => (
        <div key={it.era} className="relative">
          <span className="absolute -left-[1.4rem] top-1.5 size-3 rounded-full border-2 border-primary bg-background" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 font-display text-xs font-bold text-primary">
              {it.era}
            </span>
            <h4 className="font-display text-base font-bold">{it.title}</h4>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function HowItWorksPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-10 text-center sm:px-6 lg:px-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" /> How AetherForge AI works
          </p>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            You own your assets. <span className="text-gradient">We forge the intelligence.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            You buy your shares, crypto, silver or gold wherever you like — Sharesies, Tiger Trade,
            Interactive Brokers or any broker. AetherForge AI never touches your assets. You simply enter what
            you hold, and our Stox and Koins bots analyse the markets and hand you clear, actionable guidance.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
              <Link href="/register">Get started free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
              <Link href="#process">
                See the process <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* 1 · Overview — you keep control */}
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-border/70 bg-card/40 p-8 sm:p-12">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">The big idea</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Monitor and protect your investments — without ever giving up control
              </h2>
              <p className="mt-4 text-muted-foreground">
                AetherForge AI is purely analytical and advisory. You keep your money and your holdings in
                your own broker and wallet accounts at all times. We never take custody, never place trades,
                and never move a single dollar. Our job is to turn the markets into clarity — yours is to
                decide.
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {OVERVIEW_PILLARS.map((p) => (
                <div key={p.title} className="rounded-2xl border border-border/60 bg-background/40 p-6">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <p.icon className="size-6" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] px-5 py-4 text-center text-sm text-muted-foreground">
              <ShieldCheck className="size-5 shrink-0 text-primary" />
              <span>
                <span className="font-semibold text-foreground">AetherForge AI is not a trading platform.</span>{" "}
                We have no access to your assets — you stay in complete control on your chosen exchange.
              </span>
            </div>
          </div>
        </section>

        {/* 2 · Step-by-step process */}
        <section id="process" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Step by step</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              From your broker to your report in seven steps
            </h2>
            <p className="mt-3 text-muted-foreground">
              A clear, repeatable process you control from start to finish.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="group rounded-3xl border border-border/70 bg-card/40 p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-4xl font-extrabold text-primary/25">{s.n}</span>
                  <div className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-primary">
                    <s.icon className="size-5" />
                  </div>
                </div>
                <h3 className="mt-4 font-display text-base font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
            <div className="flex flex-col justify-center rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 to-card/40 p-6 text-center shadow-glow">
              <p className="font-display text-lg font-bold">Ready to run it?</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your first full report is free — no card required.
              </p>
              <Button asChild className="mt-4 font-semibold">
                <Link href="/register">
                  Start free <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* 3 · What the report contains */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-card/60 p-8 sm:p-12">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-primary">Your AI report</p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  What every report contains
                </h2>
              </div>
              <Button asChild variant="outline">
                <Link href="/#bots">
                  See a sample <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {REPORT_CONTENTS.map((c) => (
                <div
                  key={c.label}
                  className="rounded-2xl border border-border/60 bg-background/40 p-5"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <c.icon className="size-5" />
                  </div>
                  <p className="mt-3 font-semibold">{c.label}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The two bots */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">The engines</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Two specialised AI bots
            </h2>
            <p className="mt-3 text-muted-foreground">
              Choose the right analyst for the job — or run both and let Totalum unify them.
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

        {/* 4 · Where to buy — platform windows */}
        <section id="where-to-buy" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Where to buy</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Trusted platforms to buy your assets
            </h2>
            <p className="mt-3 text-muted-foreground">
              You buy and hold everything on these platforms — then track and analyse it here. Links open in a
              new tab. We&apos;re not affiliated with, and don&apos;t earn from, any provider listed.
            </p>
          </div>

          {/* Stocks */}
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="size-5 text-emerald-600" />
            <h3 className="font-display text-xl font-bold">Shares & ETFs</h3>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STOCK_PLATFORMS.map((p) => (
              <PlatformCard key={p.name} p={p} />
            ))}
          </div>

          {/* Crypto */}
          <div className="mb-3 mt-12 flex items-center gap-2">
            <Bitcoin className="size-5 text-amber-600" />
            <h3 className="font-display text-xl font-bold">Cryptocurrency</h3>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CRYPTO_PLATFORMS.map((p) => (
              <PlatformCard key={p.name} p={p} />
            ))}
          </div>

          {/* Metals */}
          <div className="mb-3 mt-12 flex items-center gap-2">
            <Coins className="size-5 text-yellow-600" />
            <h3 className="font-display text-xl font-bold">Gold & Silver</h3>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {METAL_PLATFORMS.map((p) => (
              <PlatformCard key={p.name} p={p} />
            ))}
          </div>
        </section>

        {/* 5 · How buying & selling works */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">The basics</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              How buying &amp; selling works
            </h2>
            <p className="mt-3 text-muted-foreground">
              New to investing? Here&apos;s the simple version for each asset class.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {BUY_GUIDES.map((g) => (
              <div key={g.title} className="rounded-3xl border border-border/70 bg-card/40 p-7">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                  <g.icon className={`size-6 ${g.color}`} />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold">{g.title}</h3>
                <ol className="mt-4 space-y-3">
                  {g.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 font-display text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* 6 + 7 · Education — history + crypto */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Learn the background</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              A little history goes a long way
            </h2>
            <p className="mt-3 text-muted-foreground">
              Understanding where markets came from makes today&apos;s decisions clearer.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Stock history */}
            <div className="rounded-3xl border border-border/70 bg-card/40 p-8">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-transparent">
                  <History className="size-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">History of stock trading</h3>
                  <p className="text-sm text-muted-foreground">Four centuries of share markets</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Share markets let you own a piece of a real business and share in its success. The idea is
                surprisingly old — and it&apos;s been getting more accessible ever since.
              </p>
              <Timeline items={STOCK_HISTORY} />
            </div>

            {/* Crypto education */}
            <div className="rounded-3xl border border-border/70 bg-card/40 p-8">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-transparent">
                  <Layers className="size-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">Cryptocurrency &amp; its value</h3>
                  <p className="text-sm text-muted-foreground">What it is and how it earned worth</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Cryptocurrency is digital money secured by cryptography and maintained by a worldwide network
                — no bank required. Its value grew from genuine scarcity, authenticity and usefulness, and the
                shared belief of a growing global community.
              </p>
              <Timeline items={CRYPTO_HISTORY} />
              <div className="mt-6">
                <CryptoInfoModal triggerLabel="Read the full crypto primer" className="w-full sm:w-auto" />
              </div>
            </div>
          </div>
        </section>

        {/* Trust / control reassurance */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Lock,
                title: "We never hold your assets",
                body: "Your shares, coins and metals stay in your own accounts. AetherForge has zero access to move or spend them.",
              },
              {
                icon: BadgeCheck,
                title: "You make every decision",
                body: "Our reports recommend and explain — you choose whether to act, and you place trades on your own platform.",
              },
              {
                icon: Store,
                title: "Private by design",
                body: "Every holding, report and conversation is scoped strictly to your account. Your data is never shared.",
              },
            ].map((t) => (
              <div key={t.title} className="rounded-3xl border border-border/70 bg-card/40 p-7">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <t.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
              </div>
            ))}
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
              Keep buying wherever you like — then let AetherForge turn your holdings into decisive clarity.
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
                Conduct Act 2013. Platform links are provided for convenience only and are not endorsements.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
