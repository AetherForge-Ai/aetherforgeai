import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Sparkles,
  Wallet,
  Newspaper,
  Compass,
  BellRing,
  ListChecks,
  AlertTriangle,
  CalendarClock,
  ShieldAlert,
  TrendingUp,
  Bitcoin,
  FileSpreadsheet,
  Target,
  CheckCircle2,
  XCircle,
  Gauge,
  Trophy,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How to Maximize Results with AetherForge AI",
  description:
    "The complete framework for extracting maximum clarity, consistency and edge from Stox, Koins and Totalum — build an accurate portfolio, run daily briefings, and follow a disciplined weekly routine.",
};

/* ---------------------------------------------------------------- data */

const SECTIONS = [
  {
    n: "01",
    icon: Wallet,
    accent: "from-emerald-500/15",
    ring: "border-emerald-500/25",
    title: "Build a Complete & Accurate Portfolio",
    tag: "Foundation",
    lead: "The quality of your results starts with the quality of the data you feed the system.",
    points: [
      "Add every holding you own — stocks, crypto, and physical gold/silver.",
      "Use exact ticker symbols (e.g. AIR.NZ, NVDA, BTC).",
      "Enter accurate share/unit counts and cost basis (purchase price).",
      "Update your portfolio regularly — especially after buys, sells, or dividends.",
      "Use the downloadable Excel Transaction Tracker to keep perfect records, then mirror the data in your dashboard.",
    ],
    tip: "Users who maintain accurate, up-to-date portfolios consistently report clearer signals and more confident decision-making.",
  },
  {
    n: "02",
    icon: Newspaper,
    accent: "from-sky-500/15",
    ring: "border-sky-500/25",
    title: "Use Stox & Koins Daily",
    tag: "Your Daily Intelligence Briefing",
    lead: "Stox (Equities) and Koins (Crypto) are your two specialist analysts — put them to work every day.",
    points: [
      "Run a full Apex report on your portfolio at least once per day — ideally before NZ market open.",
      "Read the multi-timeframe analysis: short, medium and long-term.",
      "Focus on top gainers & momentum, 7-day forward pathways, and data-backed Buy / Sell / Hold guidance.",
      "Cross-reference Stox and Koins whenever you hold both stocks and crypto.",
    ],
    tip: "Treat the reports like a professional briefing. Don’t just hunt for “Buy” signals — understand the why behind every observation.",
  },
  {
    n: "03",
    icon: Compass,
    accent: "from-violet-500/15",
    ring: "border-violet-500/25",
    title: "Activate Totalum for Portfolio-Level Strategy",
    tag: "The Master Architect",
    lead: "Totalum is your master architect. Use it to see the big picture across every asset class.",
    points: [
      "Generate a Total Portfolio Intelligence Report at least once per week.",
      "Use the Strategy Builder — tell Totalum your goals (e.g. “Aggressive growth with 30% crypto” or “Balanced income + growth”).",
      "Run Scenario Simulations (bull / base / bear) before making large allocation changes.",
      "Use Totalum’s rebalancing suggestions to reduce concentration risk and improve diversification.",
    ],
    tip: "Totalum shines when your portfolio mixes assets (stocks + crypto + metals). It sees connections individual bots might miss.",
  },
  {
    n: "04",
    icon: BellRing,
    accent: "from-amber-500/15",
    ring: "border-amber-500/25",
    title: "Set Smart Price Alerts",
    tag: "Never Miss Key Levels",
    lead: "Price alerts turn passive monitoring into active opportunity capture.",
    points: [
      "Set alerts at key technical levels suggested in Stox / Koins reports.",
      "Use alerts for both entry and exit points.",
      "Combine alerts with Totalum’s scenario pathways for higher-conviction trades.",
      "Review and adjust alerts weekly as market conditions change.",
    ],
    tip: null,
  },
  {
    n: "05",
    icon: ListChecks,
    accent: "from-teal-500/15",
    ring: "border-teal-500/25",
    title: "Follow a Disciplined Process",
    tag: "The Real Edge",
    lead: "The users who achieve the best results follow a repeatable process:",
    points: [
      "Morning Ritual — check overnight moves + run Stox / Koins reports.",
      "Review Totalum — look at overall portfolio health and strategy alignment.",
      "Check Alerts — act only on levels you pre-planned.",
      "Document Everything — use the Excel tracker religiously.",
      "Weekly Review — generate a full Totalum report and assess performance vs plan.",
      "Risk First — never risk more than you are comfortable losing on any single idea.",
    ],
    tip: null,
    golden: "AetherForge AI gives you clarity. Discipline turns clarity into results.",
  },
];

const MISTAKES = [
  "Loading incomplete portfolios — missing holdings distort the analysis.",
  "Ignoring risk management and position sizing.",
  "Chasing every “Buy” signal without context.",
  "Not updating cost basis after averaging in or out.",
  "Trading emotionally instead of following the data.",
  "Skipping the Excel transaction log.",
  "Over-leveraging or ignoring Totalum’s risk warnings.",
];

const ROUTINE: { day: string; action: string; tools: string; time: string; icon: any }[] = [
  { day: "Monday", action: "Full portfolio review + Totalum report", tools: "Totalum", time: "20–30 min", icon: Compass },
  { day: "Daily", action: "Morning Stox + Koins briefing", tools: "Stox + Koins", time: "10 min", icon: TrendingUp },
  { day: "Daily", action: "Check & action price alerts", tools: "Alerts", time: "5 min", icon: BellRing },
  { day: "Wednesday", action: "Mid-week re-check + adjust alerts", tools: "All bots", time: "15 min", icon: Gauge },
  { day: "Friday", action: "Weekly performance review", tools: "Totalum + Excel", time: "25 min", icon: FileSpreadsheet },
  { day: "Sunday", action: "Plan the week ahead", tools: "Totalum", time: "15 min", icon: CalendarClock },
];

/* ---------------------------------------------------------------- page */

export default function MaximizeResultsPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-10 text-center sm:px-6 lg:px-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" /> Maximum Results Framework
          </p>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Get the Most Out of <span className="text-gradient">AetherForge AI</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Turn market intelligence into disciplined, high-performance trading decisions. AetherForge AI gives
            you institutional-grade tools — how you use them determines your results. Follow the framework below
            to extract maximum clarity, consistency and edge from <strong>Stox</strong>, <strong>Koins</strong>{" "}
            and <strong>Totalum</strong>.
          </p>

          <div className="mx-auto mt-6 flex max-w-2xl items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Important:</span> AetherForge AI provides analysis
              and information only. It is not financial advice. All trading involves risk of loss. Past
              performance does not guarantee future results.
            </p>
          </div>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
              <Link href="/dashboard">Open your dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
              <Link href="/totalum">
                Explore Totalum <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* The 5 framework sections */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {SECTIONS.map((s) => (
              <div
                key={s.n}
                className={`relative overflow-hidden rounded-3xl border ${s.ring} bg-card/40 p-6 sm:p-8`}
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.accent} to-transparent`} />
                <div className="relative">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
                        <s.icon className="size-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{s.tag}</p>
                        <h2 className="font-display text-2xl font-bold tracking-tight">{s.title}</h2>
                      </div>
                    </div>
                    <span className="hidden font-display text-5xl font-extrabold text-primary/15 sm:block">
                      {s.n}
                    </span>
                  </div>

                  <p className="mt-5 max-w-3xl text-muted-foreground">{s.lead}</p>

                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {s.points.map((p) => (
                      <li
                        key={p}
                        className="flex items-start gap-3 rounded-2xl border border-border/50 bg-background/40 p-4"
                      >
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                        <span className="text-sm leading-relaxed">{p}</span>
                      </li>
                    ))}
                  </ul>

                  {s.tip && (
                    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
                      <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
                      <p className="text-sm leading-relaxed">
                        <span className="font-semibold text-primary">Pro Tip:</span> {s.tip}
                      </p>
                    </div>
                  )}

                  {"golden" in s && s.golden && (
                    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-transparent p-5">
                      <Trophy className="mt-0.5 size-6 shrink-0 text-amber-500" />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">Golden Rule</p>
                        <p className="mt-1 font-display text-lg font-semibold">{s.golden}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Excel tracker highlight */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-6 rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-card/60 p-8 sm:flex-row sm:items-center sm:p-10">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/60">
              <FileSpreadsheet className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold tracking-tight">Excel Transaction Tracker</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Keep flawless records of every buy, sell, dividend and cost-basis adjustment. Your professional
                investor workbook comes pre-filled with your current holdings — download it, log religiously,
                then mirror the data in your dashboard for the sharpest possible signals.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0 font-semibold shadow-glow">
              <a href="/api/downloads/toolkit">
                Download tracker <ArrowRight className="ml-1 size-4" />
              </a>
            </Button>
          </div>
        </section>

        {/* Common mistakes */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10">
              <AlertTriangle className="size-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-500">Stay on the path</p>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Common mistakes that reduce results
              </h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {MISTAKES.map((m) => (
              <div
                key={m}
                className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4"
              >
                <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
                <span className="text-sm leading-relaxed">{m}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Weekly routine */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Maximum Results Framework</p>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Recommended weekly routine
            </h2>
            <p className="mt-3 text-muted-foreground">
              Users who follow a structured routine consistently report higher confidence and better decision
              quality.
            </p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/40">
            {/* header row (desktop) */}
            <div className="hidden grid-cols-[1fr_2.4fr_1.2fr_0.9fr] gap-4 border-b border-border/60 bg-background/40 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
              <span>Day</span>
              <span>Action</span>
              <span>Tool(s)</span>
              <span className="text-right">Time</span>
            </div>
            {ROUTINE.map((r, i) => (
              <div
                key={`${r.day}-${r.action}`}
                className={`grid grid-cols-1 gap-2 px-6 py-4 sm:grid-cols-[1fr_2.4fr_1.2fr_0.9fr] sm:items-center sm:gap-4 ${
                  i !== ROUTINE.length - 1 ? "border-b border-border/50" : ""
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <r.icon className="size-4 text-primary" />
                  </div>
                  <span className="font-semibold">{r.day}</span>
                </div>
                <span className="text-sm text-muted-foreground sm:text-foreground">{r.action}</span>
                <span className="text-sm">
                  <span className="rounded-full border border-border/60 bg-background/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {r.tools}
                  </span>
                </span>
                <span className="text-sm font-medium text-muted-foreground sm:text-right">{r.time}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Final word */}
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card/60 to-card/60 px-8 py-14 text-center shadow-glow sm:px-12">
            <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative">
              <Target className="mx-auto size-10 text-primary" />
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">The final word</h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                AetherForge AI was built to give serious traders and investors the same quality of market
                intelligence that was previously available only to institutions. The platform is powerful — your
                process makes it profitable.
              </p>
              <p className="mx-auto mt-4 max-w-2xl font-display text-lg font-semibold">
                Stay disciplined. Stay data-driven. Use every tool — Stox, Koins, Totalum, alerts and the Excel
                tracker — together as one integrated system.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
                  <Link href="/dashboard">Go to dashboard</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>

              {/* quick tool jump */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <TrendingUp className="size-4 text-primary" /> Stox
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Bitcoin className="size-4 text-primary" /> Koins
                </Link>
                <Link
                  href="/totalum"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Compass className="size-4 text-primary" /> Totalum
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Strong disclaimer */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-border/70 bg-card/30 p-6 sm:p-8">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="size-5 text-muted-foreground" />
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Important disclaimer
              </h3>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              AetherForge AI provides general market information and AI-generated analysis only. It is not
              licensed financial advice under the Financial Markets Conduct Act 2013. Trading and investing carry
              a high risk of loss. Past performance is not indicative of future results. Always do your own
              research and consult a licensed financial adviser before making any investment decisions. Forge
              Intelligence Limited accepts no liability for any losses incurred.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-sm text-center sm:text-left">
                <BrandLogo animated markClassName="size-11" wordmarkClassName="text-lg" />
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  New Zealand–owned and operated multi-asset market intelligence. Turning NZX, ASX and global
                  market data into decisive clarity.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-muted-foreground">
                <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
                <Link href="/how-to-maximize-results" className="hover:text-foreground">Maximize results</Link>
                <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
                <Link href="/totalum" className="hover:text-foreground">Totalum</Link>
                <Link href="/privacy-policy" className="hover:text-foreground">AI Privacy Act</Link>
                <Link href="/ai-disclaimer" className="hover:text-foreground">AI Disclaimer</Link>
              </div>
            </div>
            <div className="mt-10 border-t border-border/50 pt-6 text-center text-xs leading-relaxed text-muted-foreground">
              <p>
                © {new Date().getFullYear()} AetherForge AI — New Zealand owned &amp; operated. For informational
                purposes only. Not licensed financial advice under the Financial Markets Conduct Act 2013.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
