import Link from "next/link";
import { ExampleExplanationReport } from "@/components/how-it-works/ExampleExplanationReport";
import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { SiteHeader } from "@/components/SiteHeader";
import { BOT_COUNT_LINE, DATA_SHARING_LINE, FREE_REPORTS_LINE, PAPER_BOOK_STATEMENT, SMITTY_ROLE_LINE } from "@/lib/public-copy";
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
  Bot,
  Landmark,
  ShoppingCart,
  Sparkles,
  Store,
  BadgeCheck,
  History,
  Layers,
} from "lucide-react";

export const metadata: Metadata = publicPageMetadata("/how-it-works", {
  title: "How It Works — AetherForge AI",
  description:
    "AetherForge is a paper book: you record cash, buys, sells, corrections and dividends in NZ$. Real trades happen at your broker. We never move money.",
});

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const OVERVIEW_PILLARS = [
  {
    icon: Wallet,
    title: "Record it on the paper book",
    body: "Cash, buys, sells, corrections and dividends are entries in NZ$. A CSV of ticker, units and price paid can be imported as well.",
  },
  {
    icon: Landmark,
    title: "Real trades stay at your broker",
    body: "A buy on AetherForge does not send an order. If you trade for real, you do that at your own broker.",
  },
  {
    icon: Bot,
    title: "We analyse and explain",
    body: "Stox, Koins and The Headmaster read the book you recorded and return plain-English, illustrative scenarios. They are informational — not personalised advice.",
  },
];

const STEPS = [
  {
    n: "01",
    icon: LineChart,
    title: "Open the paper book",
    body: "Sign in and open your dashboard. A new book starts at NZ$0.00. Nothing is sent to a broker.",
  },
  {
    n: "02",
    icon: Wallet,
    title: "Record cash",
    body: "Deposit the NZ$ you want on the book. That cash is a record. We never move money.",
  },
  {
    n: "03",
    icon: ShoppingCart,
    title: "Record a buy",
    body: "Search a share, a CoinGecko coin, a DEX token, or gold or silver. Record the quantity, the price and the fee. The fee starts at NZ$0.00.",
  },
  {
    n: "04",
    icon: ListChecks,
    title: "Record a sell, a correction or a dividend",
    body: "A sell, a correction and a dividend use the same panel. A correction changes the cost basis. Cash does not move unless the entry is a buy, a sell, a dividend or cash itself.",
  },
  {
    n: "05",
    icon: FileBarChart,
    title: "Read the ledger",
    body: "Cash, buys, sells, corrections and dividends stay in one NZ$ ledger. You can export that book as a CSV.",
  },
  {
    n: "06",
    icon: Bot,
    title: "Read the notes",
    body: "Stox, Koins and The Headmaster write informational notes about what you recorded. They do not place a trade.",
  },
  {
    n: "07",
    icon: Landmark,
    title: "Keep real trades at your broker",
    body: "When you want a real holding, you place that trade at your broker. AetherForge is not a broker and does not execute.",
  },
];

const REPORT_CONTENTS = [
  { icon: BarChart3, label: "Market breakdown", desc: "NZX, ASX and US tables when the price feed has rows, with the context around every ticker you keep." },
  { icon: TrendingUp, label: "What has performed well", desc: "Your top movers surfaced and ranked across 24h, 7-day and 30-day windows." },
  { icon: LineChart, label: "Performance graphs", desc: "30-day history (projections), ~6 months (stock charts)." },
  { icon: GaugeCircle, label: "7-day illustrative outlook", desc: "Probabilistic scenario ranges with confidence scores, momentum and continuation graphs. Not a guarantee." },
  { icon: ListChecks, label: "Plain-English notes", desc: "What the figures show, in sentences. Informational only — not personal financial advice." },
  { icon: Route, label: "Three scenarios", desc: "Three scenarios: a cautious, a middle and a high-volatility case, so you can see the range of outcomes." },
];

const BOTS = [
  {
    icon: TrendingUp,
    name: "Stox",
    subtitle: "Stock Market Intelligence",
    accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
    ring: "border-emerald-500/30",
    desc: "Sweeps NZX, ASX and global equities — compiling detailed tables and top-mover boards. Stock charts cover about six months.",
    tags: ["NZX", "ASX", "US & global equities"],
  },
  {
    icon: Bitcoin,
    name: "Koins",
    subtitle: "Crypto Market Intelligence",
    accent: "from-amber-500/20 via-orange-500/10 to-transparent",
    ring: "border-amber-500/30",
    desc: "Tracks up to 400 coins, depending on what the data feed returns, and the wider digital-asset market — synthesising flows, news and sentiment into illustrative 7-day scenarios and forward pathways. Crypto projections on the projections page stay paused.",
    tags: ["BTC", "ETH", "Up to 400 coins"],
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
    desc: "A hugely popular New Zealand platform that lets you acquire NZX, ASX and US shares and ETFs with as little as one cent. Simple, mobile-first and ideal for first-time investors.",
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
    tag: "NZD · own wallet",
    region: "New Zealand",
    desc: "A service for acquiring and exiting major cryptocurrencies, with coins sent to your own wallet.",
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
    desc: "A publicly listed US exchange with a simple interface that's popular with newcomers. Acquire, exit or keep hundreds of digital assets with a familiar, guided flow.",
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
    desc: "A New Zealand bullion dealer offering gold and silver bars and coins at competitive margins, with repurchase options and vaulted storage for larger holdings.",
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
    title: "How to acquire and exit shares",
    color: "text-emerald-600",
    steps: [
      "Open an account with a broker like Sharesies, Tiger Trade or Interactive Brokers and verify your identity.",
      "Deposit funds from your bank, then search for a company by its ticker (e.g. FPH.NZ, AAPL).",
      "Place an order for the number of shares — or dollar amount — you want, and confirm.",
      "To exit later, place an order to close the position; proceeds settle back to your account, ready to withdraw.",
    ],
  },
  {
    icon: Coins,
    title: "How to acquire cryptocurrency",
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
    title: "How to acquire gold and silver",
    color: "text-yellow-600",
    steps: [
      "Choose physical bullion (bars/coins) from a dealer like the NZ Mint, MyGold or BullionStar.",
      "Compare the price against the live spot rate plus the dealer's premium.",
      "Place the order and arrange insured delivery to you, or secure vaulted storage with the dealer.",
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
            A paper book in NZ$. <span className="text-gradient">Notes on what you record.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {PAPER_BOOK_STATEMENT}
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
                One trade flow, on a paper book
              </h2>
              <p className="mt-4 text-muted-foreground">
                {PAPER_BOOK_STATEMENT} Stox, Koins and The Headmaster then write informational notes about
                that book. They do not place a trade.
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
                <span className="font-semibold text-foreground">AetherForge AI is not a broker.</span>{" "}
                Recording a buy does not send money. We never move money.{" "}
                <Link href="/ai-disclaimer" className="font-medium text-primary hover:underline">
                  Full AI disclaimer
                </Link>
                .
              </span>
            </div>
          </div>
        </section>

        {/* 2 · Step-by-step process */}
        <section id="process" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Step by step</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Record cash, buys, sells, corrections and dividends
            </h2>
            <p className="mt-3 text-muted-foreground">
              One panel writes the paper book. Real trades happen at your broker.
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
                {FREE_REPORTS_LINE}
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
                <Link href="#example-report">
                  See an example <ArrowRight className="ml-1 size-4" />
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

        <ExampleExplanationReport />

        {/* The two bots */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">The engines</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {BOT_COUNT_LINE}
            </h2>
            <p className="mt-3 text-muted-foreground">
              Stox, Koins and The Headmaster are the three AI bots. {SMITTY_ROLE_LINE}
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

        {/* 4 · Where to acquire — platform windows */}
        <section id="where-to-acquire" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Your broker</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Where a real trade happens
            </h2>
            <p className="mt-3 text-muted-foreground">
              {PAPER_BOOK_STATEMENT} These are examples of brokers and dealers. Links open in a new tab.
              We are not affiliated with, and do not earn from, any provider listed.
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
              These steps are what a broker or dealer does. On AetherForge you only record the result in NZ$. We never move money.
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
                title: "We never take custody of your assets",
                body: "Your shares, coins and metals stay in your own accounts. AetherForge has zero access to move or spend them.",
              },
              {
                icon: BadgeCheck,
                title: "You make every decision",
                body: "Reports explain the figures. They do not recommend a trade. You decide, and you place any trade on your own platform.",
              },
              {
                icon: Store,
                title: "Private by design",
                body: `Every holding, report and conversation is scoped strictly to your account. ${DATA_SHARING_LINE}`,
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
              {PAPER_BOOK_STATEMENT}
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

      </div>
    </div>
  );
}
