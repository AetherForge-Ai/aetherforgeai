import Link from "next/link";
import { FmcStatement } from "@/components/legal/DisclaimerNotice";
import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { LEGAL_ENTITY_NAME } from "@/lib/company";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { DashboardEntryButton } from "@/components/dashboard/MemberDashboardPrompt";
import {
  ArrowRight,
  Sparkles,
  Wallet,
  Newspaper,
  Compass,
  BellRing,
  ListChecks,
  AlertTriangle,
  ShieldAlert,
  TrendingUp,
  Bitcoin,
  FileSpreadsheet,
  Target,
  CheckCircle2,
  XCircle,
  Trophy,
} from "lucide-react";

export const metadata: Metadata = publicPageMetadata("/how-to-maximize-results", {
  title: "Getting the most from AetherForge AI",
  description:
    "How to use Stox, Koins and The Headmaster within your plan: keep an accurate book and read the notes as information.",
});

/* ---------------------------------------------------------------- data */

const SECTIONS = [
  {
    n: "01",
    icon: Wallet,
    accent: "from-emerald-500/15",
    ring: "border-emerald-500/25",
    title: "Keep a complete and accurate book",
    tag: "Foundation",
    lead: "The notes can only describe what you have recorded in your book.",
    points: [
      "Add the holdings you want covered: shares, crypto and physical gold or silver.",
      "Use exact ticker symbols (for example AIR.NZ, NVDA or BTC).",
      "Enter accurate quantities and the price you paid.",
      "Update the book after a buy, a sell or a dividend.",
      "Yearly plans include a blank Excel investor toolkit template if you want to keep your own records as well.",
    ],
    tip: "Keep the book current after a buy, a sell, or a dividend. The notes can only describe what you recorded.",
  },
  {
    n: "02",
    icon: Newspaper,
    accent: "from-sky-500/15",
    ring: "border-sky-500/25",
    title: "Read your bot's notes when you need them",
    tag: "Stox or Koins",
    lead: "Free and Starter include one bot: Stox (shares) or Koins (crypto). Pro and Ultimate include both.",
    points: [
      "Your plan sets how many reports you can create each month (Free 3, Starter 15). Spread them across the month.",
      "Each report covers short, medium and long-term views of the holdings in your book.",
      "Read top gainers, momentum and the 7-day pathways as information. They are not a recommendation to buy, sell, or hold.",
      "If your plan includes both bots, you can read the Stox and Koins notes side by side.",
    ],
    tip: "Read the note as a briefing. Look at the reason for each observation. The note is not an instruction to buy or sell.",
  },
  {
    n: "03",
    icon: Compass,
    accent: "from-violet-500/15",
    ring: "border-violet-500/25",
    title: "Use The Headmaster for the whole book",
    tag: "Portfolio overview",
    lead: "The Headmaster report looks across every asset class in your book.",
    points: [
      "Create a Headmaster report when you want a full overview of holdings, allocation and cash.",
      "Read the allocation notes as general information. They are not personalised advice and they do not tell you to rebalance.",
      "Check which plans include The Headmaster on the pricing page.",
    ],
    tip: "The Headmaster is most useful when your book mixes asset classes, such as shares, crypto and metals.",
  },
  {
    n: "04",
    icon: BellRing,
    accent: "from-amber-500/15",
    ring: "border-amber-500/25",
    title: "Note the price levels you care about",
    tag: "Price markers",
    lead: "A price marker records a level you chose. Reaching that level is information, not an instruction to buy, sell, or trim.",
    points: [
      "You can note a level that appeared in a Stox or Koins explanation.",
      "You can note levels above and below the price paid.",
      "Review the levels you noted when the market has moved.",
    ],
    tip: null,
  },
  {
    n: "05",
    icon: ListChecks,
    accent: "from-teal-500/15",
    ring: "border-teal-500/25",
    title: "Keep a regular routine",
    tag: "Routine",
    lead: "A repeatable routine is one way to read the book:",
    points: [
      "Record new trades and dividends as they happen.",
      "Read your bot's latest report when you have one available.",
      "Check the markers you noted. They are information, not an instruction to trade.",
      "Only risk money you are comfortable losing on any single idea.",
    ],
    tip: null,
    golden: "AetherForge AI provides information. Your decisions, and their results, are your own.",
  },
];

const MISTAKES = [
  "Leaving holdings out of the book, so the notes describe an incomplete picture.",
  "Ignoring position size and risk.",
  "Treating an informational note as an instruction to trade.",
  "Not updating the price paid after buying or selling more.",
  "Trading on emotion.",
];

const ROUTINE: { day: string; action: string; tools: string; time: string; icon: any }[] = [
  { day: "After a trade", action: "Record the buy, sell or dividend in your book", tools: "Dashboard", time: "2 min", icon: Wallet },
  { day: "Weekly", action: "Read the price markers you noted", tools: "Markers", time: "5 min", icon: BellRing },
  { day: "Fortnightly", action: "Read a Stox or Koins report (within your plan's monthly allowance)", tools: "Your bot", time: "10 min", icon: TrendingUp },
  { day: "Monthly", action: "Read a Headmaster report, if your plan includes it", tools: "The Headmaster", time: "20 min", icon: Compass },
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
            <Sparkles className="size-3.5" /> Using the research desk
          </p>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Get the Most Out of <span className="text-gradient">AetherForge AI</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Use the research desk with a repeatable process. AetherForge AI gives you informational tools —
            how you use them is up to you, and you still execute on your own broker. Follow the framework below
            for <strong>Stox</strong>, <strong>Koins</strong> and <strong>The Headmaster</strong>.
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
            <DashboardEntryButton size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
              Open your dashboard
            </DashboardEntryButton>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
              <Link href="/how-it-works">
                See how it works <ArrowRight className="ml-1 size-4" />
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">Remember</p>
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
              <h2 className="font-display text-2xl font-bold tracking-tight">Excel investor toolkit template</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Yearly plans include a downloadable Excel investor toolkit template for buys, sells,
                dividends, and cost-basis notes. The workbook is a blank template. It is not filled from
                your holdings. Download it, keep your own records, and enter the figures you want in the dashboard.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0 font-semibold shadow-glow">
              <a href="/pricing">
                Yearly plans <ArrowRight className="ml-1 size-4" />
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
                Common pitfalls
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
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Routine</p>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              An example routine
            </h2>
            <p className="mt-3 text-muted-foreground">
              A weekly routine is a way to read the book. It is not a claim about results.
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
                AetherForge AI provides information about the book you record. It does not tell you what to buy or
                sell, and it does not promise any result.
              </p>
              <p className="mx-auto mt-4 max-w-2xl font-display text-lg font-semibold">
                Use the tools your plan includes, keep your book up to date, and make your own decisions.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <DashboardEntryButton size="lg" className="h-12 px-8 text-base font-semibold shadow-glow">
                  Go to dashboard
                </DashboardEntryButton>
                <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                  <Link href="/pricing">View pricing</Link>
                </Button>
              </div>

              {/* quick tool jump */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/stox"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <TrendingUp className="size-4 text-primary" /> Stox
                </Link>
                <Link
                  href="/koins"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Bitcoin className="size-4 text-primary" /> Koins
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/50 px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Compass className="size-4 text-primary" /> Pricing
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
              AetherForge AI provides general market information and AI-generated analysis only.{" "}
              <FmcStatement /> Trading and investing carry
              a high risk of loss. Past performance is not indicative of future results. Always do your own
              research and consult a licensed financial adviser before making any investment decisions.{" "}
              To the extent permitted by law, {LEGAL_ENTITY_NAME} is not liable for losses arising from your reliance
              on this information, as set out in sections 9 and 11 of our{" "}
              <Link href="/terms-of-service" className="underline">Terms of Service</Link>. Nothing on this page
              limits your rights under the Consumer Guarantees Act 1993 or the Fair Trading Act 1986.
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
