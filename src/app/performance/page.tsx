import Link from "next/link";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { LEGAL_ENTITY_NAME } from "@/lib/company";
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

export const metadata = publicPageMetadata("/performance", {
  title: "Example results — paper portfolio snapshots | AetherForge AI",
  description:
    "Timestamped screenshots of an AetherForge paper portfolio. Illustrative only — not a trading platform, not a broker, and not a promise of future returns.",
});

const SAMPLE_NOTES = [
  {
    icon: BadgeCheck,
    title: "One paper book",
    body: "Every screenshot is the same paper portfolio on 7–8 July 2026. AetherForge did not place the trades.",
  },
  {
    icon: Zap,
    title: "One meaning of 1.98%",
    body: "1.98% is the mark-to-market change from NZ$100,429 to the day's high of NZ$102,421.30, over about 8–9 hours. It is not a 7-day figure and not a forecast.",
  },
  {
    icon: BrainCircuit,
    title: "One Sharpe reading",
    body: "The +30 minute screen shows Sharpe 0.15. That is the only Sharpe quoted on this page.",
  },
  {
    icon: Globe2,
    title: "One day's high",
    body: "NZ$102,421.30 is the highest mark that day. NZ$101,931.77 is an earlier reading, not the high.",
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
            Example results
          </h1>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground sm:mt-8 sm:text-lg">
            <p>
              These are timestamped screenshots from one paper portfolio on one session, from just
              after 9am through to around the close that day. They show how the book was marked.
              Treat them as a single dated sample.
            </p>
            <p>
              Each screenshot is dated with the prices that were on that screen. Together they are one
              sample of one paper book.
            </p>
            <p>
              Over that day the paper portfolio showed about a 1.98% mark-to-market change across
              8–9 hours. That is one example from one day. It is not a claim that AetherForge beats
              every platform, and it is not a promise that results will be positive again.
            </p>
            <p>
              The screenshots use market data that was available at those times. AetherForge is a
              paper portfolio and research tool — it does not place trades, and past examples are
              not a forecast.
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
              One paper book, 7–8 July 2026: NZ$100,429 to a day's high of NZ$102,421.30 (about 1.98%)
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Seven timestamped snapshots from a single session. The marks moved by about NZ$2,000
              on that day. That is one example. It is not a forecast, not a promise, and not money
              placed with a broker.{" "}
              <Link href="/ai-disclaimer" className="font-medium text-primary hover:underline">
                AI disclaimer
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ────────────  WHAT THIS DATED SAMPLE SHOWS  ──────────── */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">The sample</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              What this dated sample shows
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLE_NOTES.map((s) => (
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
            These figures were captured while markets were open. They show how the paper book was
            marked that day. They are not a guarantee, not a comparison that AetherForge beats other
            products, and not evidence of money placed with a broker.
          </p>
        </section>

        {/* ──────────────────  FOOTER + DISCLAIMER  ────────────────── */}
        <footer className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-sm text-center sm:text-left">
                <BrandLogo animated markClassName="size-11" wordmarkClassName="text-lg" />
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {LEGAL_ENTITY_NAME}, a New Zealand limited company. Market intelligence for NZX, ASX
                  and global markets.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-muted-foreground">
                <Link href="/performance" className="hover:text-foreground">Example results</Link>
                <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
                <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
                <Link href="/about" className="hover:text-foreground">About</Link>
                <Link href="/privacy-policy" className="hover:text-foreground">Privacy</Link>
                <Link href="/terms-of-service" className="hover:text-foreground">Terms</Link>
                <Link href="/ai-disclaimer" className="hover:text-foreground">AI Disclaimer</Link>
                <Link href="/docs" className="hover:text-foreground">Docs</Link>
              </div>
            </div>

            {/* Risk disclaimer */}
            <div className="mt-10 border-t border-border/50 pt-6">
              <p className="text-center text-xs leading-relaxed text-muted-foreground/70">
                Example screenshots are illustrative. AetherForge does not execute trades and is not a
                licensed financial advice service. Past paper-portfolio changes are not a reliable
                indicator of future results. Markets can fall as well as rise.
              </p>
              <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground/70">
                © {new Date().getFullYear()} {LEGAL_ENTITY_NAME}. For informational purposes only. Not
                licensed financial advice under the Financial Markets Conduct Act 2013.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
