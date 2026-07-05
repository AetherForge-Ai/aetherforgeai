import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { LOGO_MARK_IMG } from "../../assets/files";
import { MarketTicker } from "@/components/MarketTicker";
import { BotShowcase } from "@/components/bots/BotShowcase";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  LineChart,
  Sparkles,
  ShieldCheck,
  Bot,
  Wallet,
  TrendingUp,
  PieChart,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Wallet,
    title: "Live portfolio tracking",
    desc: "Add holdings by ticker, shares and cost basis. See market value, unrealized P/L and daily moves update instantly.",
  },
  {
    icon: PieChart,
    title: "Allocation & risk",
    desc: "Understand sector tilt, concentration and diversification with clean, glanceable breakdowns.",
  },
  {
    icon: Sparkles,
    title: "AI research reports",
    desc: "Generate a full analyst-grade report on your portfolio — performance, risk and focus areas — in one click.",
  },
  {
    icon: Bot,
    title: "AI market assistant",
    desc: "Ask anything about your holdings or the broader market. AetherForge answers grounded in your real positions.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    desc: "Every position, report and conversation is scoped to your account. Your data is never shared.",
  },
  {
    icon: Zap,
    title: "Fast & focused",
    desc: "A distraction-free, dark trading-desk interface built for speed and clarity.",
  },
];

const STEPS = [
  { n: "01", t: "Create your account", d: "Sign up in seconds and secure your private workspace." },
  { n: "02", t: "Choose a plan", d: "Go monthly or yearly with AetherForge Pro — cancel anytime." },
  { n: "03", t: "Build your portfolio", d: "Add your holdings and watch your dashboard come alive." },
  { n: "04", t: "Get AI insight", d: "Generate reports and chat with your market analyst." },
];

function HeroChart() {
  // Decorative area chart (SVG) for the hero mockup
  return (
    <svg viewBox="0 0 400 160" className="h-40 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.155 165)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.78 0.155 165)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,120 C40,110 60,70 100,80 C140,90 160,40 200,55 C240,68 260,30 300,38 C340,46 360,20 400,15 L400,160 L0,160 Z"
        fill="url(#area)"
      />
      <path
        d="M0,120 C40,110 60,70 100,80 C140,90 160,40 200,55 C240,68 260,30 300,38 C340,46 360,20 400,15"
        fill="none"
        stroke="oklch(0.78 0.155 165)"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        {/* Live market ticker banners — near the top of the page */}
        <MarketTicker className="border-b border-border/60" />

        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-float-up">
              {/* Standout brand emblem — the official Forge Intelligence shield */}
              <div className="mb-6 flex items-center gap-4">
                <span className="relative grid size-16 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] via-white/[0.02] to-transparent shadow-brand animate-logo-pulse sm:size-[4.5rem]">
                  <img
                    src={LOGO_MARK_IMG}
                    alt="AetherForge AI shield emblem"
                    className="h-[78%] w-[78%] object-contain drop-shadow-[0_2px_10px_rgba(40,110,220,0.45)]"
                    draggable={false}
                  />
                </span>
                <div className="leading-tight">
                  <p className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
                    AetherForge<span className="text-primary"> AI</span>
                  </p>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Forge Intelligence Ltd
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                AI-powered market intelligence
              </div>

              <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Institutional-Grade
                <br />
                <span className="text-gradient">Market Intelligence.</span>
                <br />
                Built for New Zealand.
              </h1>

              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                The multi-asset sentinel that turns raw NZX, ASX and global market data into clear,
                actionable intelligence — previously reserved for professional traders and family
                offices.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 px-6 text-base font-semibold shadow-glow">
                  <Link href="/register">
                    Start free <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>

              <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" /> Bank-grade privacy
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" /> Real-time P/L
                </div>
              </div>
            </div>

            {/* Hero mockup card */}
            <div className="animate-float-up [animation-delay:120ms]">
              <div className="relative rounded-3xl border border-border/70 glass p-5 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Total value</p>
                    <p className="tnum mt-1 text-3xl font-bold">$248,930.44</p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-right ring-1 ring-emerald-500/25">
                    <p className="tnum text-lg font-semibold text-emerald-400">+18.6%</p>
                    <p className="text-[11px] text-muted-foreground">all time</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-3">
                  <HeroChart />
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    { s: "NVDA", n: "NVIDIA Corp.", v: "$62,400", c: "+42.1%", up: true },
                    { s: "AAPL", n: "Apple Inc.", v: "$41,220", c: "+11.3%", up: true },
                    { s: "TSLA", n: "Tesla, Inc.", v: "$18,940", c: "-6.4%", up: false },
                  ].map((r) => (
                    <div
                      key={r.s}
                      className="flex items-center justify-between rounded-xl border border-border/50 bg-card/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-lg bg-primary/10 font-display text-xs font-bold text-primary">
                          {r.s.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-none">{r.s}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{r.n}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="tnum text-sm font-semibold">{r.v}</p>
                        <p className={`tnum text-xs ${r.up ? "text-emerald-400" : "text-red-400"}`}>{r.c}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The two Apex bots — core of the product */}
        <div id="bots">
          <BotShowcase />
        </div>

        {/* Institutional Edge */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-8 sm:p-12">
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" aria-hidden />
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Institutional Edge</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
              The clarity previously reserved for professional traders and family offices.
            </h2>

            <div className="mt-8 grid gap-6 text-sm leading-relaxed text-muted-foreground md:grid-cols-2">
              <p>
                AetherForge compiles institutional-grade data tables, tracks your portfolio&apos;s profit &amp; loss in
                real time, and synthesises global news into a single, coherent picture. Every monitored company or coin
                is projected across multiple timeframes, rendered in clean visual charts, ranked to surface the day&apos;s
                top gainers, and distilled into data-backed observations you can actually act on.
              </p>
              <p>
                Existing solutions are fragmented — generic screeners bolted onto generic feeds, lacking any real depth
                on NZX and ASX. AetherForge is the New Zealand–focused, multi-asset sentinel built to close that gap,
                turning scattered market noise into decisive intelligence, without ever crossing into unlicensed
                financial advice.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "Institutional-grade data tables",
                "Real-time portfolio P&L tracking",
                "Global news synthesis",
                "Multi-timeframe projections",
                "Visual continuation charts",
                "Top-gainer identification",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-3">
                  <ShieldCheck className="size-4 shrink-0 text-primary" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>

            <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The result: institutional-quality clarity on your own holdings — delivered straight to your dashboard, at a
              fraction of the cost.
            </p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Intelligent Market Analysis</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              A trading desk for your own money
            </h2>
            <p className="mt-4 text-muted-foreground">
              Purpose-built tools that turn raw holdings into clear, actionable insight.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/70 bg-card/50 p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow"
              >
                <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-colors group-hover:bg-primary/15">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-border/70 bg-card/40 p-8 sm:p-12">
            <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                  From sign-up to insight in minutes
                </h2>
              </div>
              <Button asChild variant="outline">
                <Link href="/register">
                  Create account <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.n} className="relative">
                  <span className="font-display text-4xl font-extrabold text-primary/25">{s.n}</span>
                  <h3 className="mt-2 font-semibold">{s.t}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card/60 to-card/60 px-8 py-14 text-center shadow-glow sm:px-12">
            <LineChart className="mx-auto size-10 text-primary" />
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to see your portfolio clearly?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Join AetherForge AI and put an AI analyst to work on your investments today.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
                <Link href="/register">Get started free</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                <Link href="/login">I have an account</Link>
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
                <a
                  href="https://www.aetherforgeai.co.nz"
                  className="mt-3 inline-block font-display text-sm font-semibold text-primary hover:underline"
                >
                  www.aetherforgeai.co.nz
                </a>
              </div>

              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
                <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
                <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
                <Link href="/privacy-policy" className="hover:text-foreground">AI Privacy Act</Link>
                <Link href="/login" className="hover:text-foreground">Log in</Link>
                <Link href="/terms-of-service" className="hover:text-foreground">Terms &amp; Conditions</Link>
                <Link href="/register" className="hover:text-foreground">Sign up</Link>
                <Link href="/ai-disclaimer" className="hover:text-foreground">AI Disclaimer</Link>
              </div>
            </div>

            <div className="mt-10 border-t border-border/50 pt-6 text-center text-xs leading-relaxed text-muted-foreground">
              <p>
                © {new Date().getFullYear()} AetherForge AI — New Zealand owned &amp; operated. For
                informational purposes only.
              </p>
              <p className="mx-auto mt-2 max-w-3xl">
                AetherForge AI provides general market information and AI-generated analysis. It is
                <strong className="font-semibold text-foreground/80"> not licensed financial advice</strong> under the
                Financial Markets Conduct Act 2013. Always seek advice from a licensed financial adviser before making
                investment decisions.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
