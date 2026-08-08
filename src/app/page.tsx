import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import {
  LOGO_MARK_IMG,
  BOT_STOX_AVATAR,
  BOT_KOINS_AVATAR,
} from "../../assets/files";
import { MarketTicker } from "@/components/MarketTicker";
import { BotShowcase } from "@/components/bots/BotShowcase";
import { TotalumShowcase } from "@/components/bots/TotalumShowcase";
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
  Check,
} from "lucide-react";

/* ---- Official brand marks (lucide dropped brand icons) ---- */
function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LinkedInLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  );
}

/** Canonical social profiles — kept in one place so every surface stays in sync. */
const SOCIAL_LINKS = [
  {
    label: "X",
    handle: "@aetherforgeAi_",
    href: "https://x.com/aetherforgeAi_",
    Icon: XLogo,
  },
  {
    label: "Facebook",
    handle: "AetherForge AI",
    href: "https://www.facebook.com/profile.php?id=61591701002008",
    Icon: FacebookLogo,
  },
  {
    label: "LinkedIn",
    handle: "AetherForge AI",
    href: "https://www.linkedin.com/in/aether-forge-ai-27659b423/",
    Icon: LinkedInLogo,
  },
] as const;

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
    <div className="chrome-dark relative min-h-screen bg-background bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        {/* Live market ticker banners — near the top of the page (dark chrome) */}
        <MarketTicker className="border-b border-border/60" />

        {/* Light content sheet floating inside the dark frame — the main viewing
            area keeps the light theme, with the nav/ticker/footer dark around it. */}
        <div className="mx-auto w-full max-w-7xl px-2 py-4 sm:px-4 sm:py-5 lg:px-6">
          <div className="content-light relative overflow-hidden rounded-2xl bg-background text-foreground shadow-[0_10px_44px_-16px_rgba(0,0,0,0.55)] ring-1 ring-black/5">
            <div className="pointer-events-none absolute inset-0 bg-aurora" />
            <div className="relative">

        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-float-up">
              {/* Standout brand emblem — the official Forge Intelligence shield */}
              <div className="mb-6 flex items-center gap-4">
                <span className="relative grid size-16 place-items-center rounded-2xl border border-border/70 bg-gradient-to-br from-white via-white to-slate-50 shadow-brand animate-logo-pulse sm:size-[4.5rem]">
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
                Live NZX · ASX · Crypto intelligence
              </div>

              <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
                Institutional-grade market intelligence,{" "}
                <span className="text-gradient">built for you</span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Track your real portfolio, surface the highest-impact opportunities, and get
                AI-powered research on every position — without the noise of a traditional trading
                desk.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-12 px-7 text-base shadow-glow">
                  <Link href="/register">
                    Start free
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
                  <Link href="/performance">See live results</Link>
                </Button>
              </div>
            </div>

            {/* Hero mockup card */}
            <div className="relative animate-float-up" style={{ animationDelay: "120ms" }}>
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-amber-400/10 blur-2xl" />
              <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-5 shadow-xl sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Portfolio value
                    </p>
                    <p className="mt-0.5 font-display text-2xl font-bold tracking-tight">
                      NZ$128,450
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    +12.4%
                  </span>
                </div>
                <HeroChart />
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
                        <p className={`tnum text-xs ${r.up ? "text-emerald-600" : "text-red-600"}`}>{r.c}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Trust strip: credibility markers, scannable at a glance ─── */}
        <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 sm:grid-cols-4 sm:gap-4 sm:p-5">
            {[
              { icon: LineChart, stat: "NZX · ASX · Dow · Nasdaq", label: "Live multi-market coverage" },
              { icon: TrendingUp, stat: "Real-time", label: "Prices, P/L & projections" },
              { icon: ShieldCheck, stat: "Bank-grade", label: "Private & secure by design" },
              { icon: Sparkles, stat: "Cancel anytime", label: "No lock-in, transparent pricing" },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <t.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold tracking-tight">{t.stat}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Attention banner: real, live results ─── */}
        <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
          <Link
            href="/performance"
            className="group relative block overflow-hidden rounded-3xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/15 via-primary/10 to-emerald-500/15 p-[1.5px] shadow-glow transition-all hover:border-emerald-400/70 hover:shadow-[0_0_45px_-8px_rgba(16,185,129,0.5)]"
          >
            {/* animated shimmer sweep */}
            <span className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="relative flex flex-col items-center gap-4 rounded-[calc(1.5rem-1.5px)] bg-card/70 px-6 py-6 text-center backdrop-blur-sm sm:flex-row sm:justify-between sm:gap-6 sm:px-8 sm:text-left">
              <div className="flex items-center gap-4">
                <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-400/30">
                  <TrendingUp className="size-6" />
                </span>
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                    </span>
                    Live &amp; real
                  </div>
                  <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
                    Check out the <span className="text-gradient">real results</span> of how it works
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    See our AI&apos;s live, verifiable performance and calls in action — no cherry-picking.
                  </p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-glow transition-transform group-hover:scale-[1.03]">
                View live results
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </section>

        {/* ─── Lifetime Offer · Own Stox or Koins Forever ─── */}
        <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-amber-400/35 bg-gradient-to-br from-amber-500/10 via-primary/5 to-violet-500/10 p-[1.5px] shadow-[0_0_40px_-12px_rgba(217,119,6,0.35)]">
            <div className="relative overflow-hidden rounded-[calc(1.5rem-1.5px)] bg-card/80 px-5 py-6 backdrop-blur-sm sm:px-8 sm:py-7">
              {/* subtle gold accent line */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
                {/* Copy */}
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">
                    <Sparkles className="size-3 text-amber-600" />
                    Limited Special · One-time
                  </div>
                  <h2 className="mt-2.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
                    Own Stox or Koins Forever —{" "}
                    <span className="text-gradient">One-Time $300</span>
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Get the complete self-hosted AI market intelligence bot delivered as a
                    downloadable package. Add your own portfolio and run it yourself.
                  </p>
                </div>

                {/* Two bot mini-cards */}
                <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row sm:gap-3">
                  <Link
                    href="/own-the-bots"
                    className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:shadow-md"
                  >
                    <img
                      src={BOT_STOX_AVATAR}
                      alt="Stox"
                      className="size-11 rounded-xl object-cover ring-1 ring-emerald-500/20"
                      draggable={false}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold leading-none">Stox</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Stock Market Intelligence</p>
                    </div>
                    <ArrowRight className="ml-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                  </Link>

                  <Link
                    href="/own-the-bots"
                    className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 transition-all hover:border-amber-500/50 hover:bg-amber-500/5 hover:shadow-md"
                  >
                    <img
                      src={BOT_KOINS_AVATAR}
                      alt="Koins"
                      className="size-11 rounded-xl object-cover ring-1 ring-amber-500/20"
                      draggable={false}
                    />
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold leading-none">Koins</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Crypto Market Intelligence</p>
                    </div>
                    <ArrowRight className="ml-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The two Apex bots — core of the product */}
        <div id="bots">
          <BotShowcase />
        </div>

        {/* Totalum — the master architect that unifies both bots + metals */}
        <div id="totalum">
          <TotalumShowcase />
        </div>

        {/* Institutional Edge */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/40 p-8 sm:p-12">
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" aria-hidden />
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Institutional Edge</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
              The clarity previously reserved for professional traders and family offices.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              AetherForge compresses hours of market research into decisive, actionable intelligence
              — so you can focus on the decisions that actually move the needle.
            </p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Capabilities</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to stay ahead of the tape
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border/60 bg-card/50 p-6 transition-colors hover:border-primary/30"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Simple path</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Four steps to institutional clarity
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-border/60 bg-card/40 p-6">
                <span className="font-display text-3xl font-extrabold text-primary/30">{s.n}</span>
                <h3 className="mt-3 font-display text-lg font-bold">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-amber-500/5 px-8 py-14 text-center sm:px-12">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to take control of your market intelligence?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Join New Zealand investors who use AetherForge to cut through the noise and act with
              confidence.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 px-8 text-base shadow-glow">
                <Link href="/register">
                  Create free account
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                <Link href="/login">I have an account</Link>
              </Button>
            </div>
          </div>
        </section>

            </div>
          </div>
        </div>
        {/* /Light content sheet */}

        {/* Footer (dark chrome) */}
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
                  className="mt-4 inline-block font-display text-sm font-semibold text-primary hover:underline"
                >
                  www.aetherforgeai.co.nz
                </a>
                <div className="mt-5 flex items-center justify-center gap-2.5 sm:justify-start">
                  {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`AetherForge AI on ${label}`}
                      title={label}
                      className="grid size-10 place-items-center rounded-full border border-border/60 bg-background/40 text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
                    >
                      <Icon className="size-4" />
                    </a>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
                <Link href="/about" className="hover:text-foreground">About us</Link>
                <Link href="/performance" className="hover:text-foreground">Live results</Link>
                <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
                <Link href="/how-to-maximize-results" className="hover:text-foreground">Maximize results</Link>
                <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
                <Link href="/own-the-bots" className="hover:text-foreground">Own the bots</Link>
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