import Link from "next/link";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { pageTitle } from "@/lib/page-title";
import { LEGAL_ENTITY_NAME } from "@/lib/company";
import { PERFORMANCE_SAMPLE } from "@/lib/performance-sample";
import { SiteHeader } from "@/components/SiteHeader";
import { LiveExamplesGallery } from "@/components/performance/LiveExamplesGallery";
import {
  Zap,
  BrainCircuit,
  Globe2,
  BadgeCheck,
  LineChart,
} from "lucide-react";

/**
 * TODO(owner): publish a fresh weekly sample when a new dated capture of the paper book exists.
 * Do not invent performance figures or a new sample book.
 */

export const metadata = publicPageMetadata("/performance", {
  title: pageTitle("Example results"),
  description:
    "Timestamped screenshots of an AetherForge paper portfolio. Illustrative only — not a trading platform, not a broker, and not a promise of future returns.",
});

const SAMPLE_NOTES = [
  {
    icon: BadgeCheck,
    title: "One paper book",
    body: "Every screenshot is the same paper portfolio on 7–8 Jul 2026. AetherForge did not place the trades.",
  },
  {
    icon: Zap,
    title: "One meaning of 1.98%",
    body: PERFORMANCE_SAMPLE.definition,
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
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">{PERFORMANCE_SAMPLE.label}</p>
          <h1 className="mt-3 font-grift-black text-4xl tracking-tight text-amber-400 sm:text-5xl">
            Example results
          </h1>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground sm:mt-8 sm:text-lg">
            <p>
              These are timestamped screenshots from one paper portfolio on 7–8 Jul 2026,
              from just after 9:00 am through to around the close. They show how the book was marked.
              Treat them as a single dated sample.
            </p>
            <p>
              Each screenshot is dated with the prices that were on that screen. Together they are one
              sample of one paper book.
            </p>
            <p>
              {PERFORMANCE_SAMPLE.definition} That is one example from that session. It is not a claim that AetherForge beats
              every platform, and it is not a promise that results will be positive again.
            </p>
            <p>
              The screenshots use market data that was available at those times. AetherForge is a
              paper portfolio and research tool — it does not place trades, and past examples are
              not a forecast. The{" "}
              <Link href="/track-record" className="font-medium text-primary hover:underline">
                track record
              </Link>{" "}
              is a separate log of forecasts. It starts empty.
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
              One paper book, {PERFORMANCE_SAMPLE.label}: {PERFORMANCE_SAMPLE.opening} to a day's high of {PERFORMANCE_SAMPLE.high} ({PERFORMANCE_SAMPLE.pct})
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Seven timestamped snapshots from a single session. The marks moved by {PERFORMANCE_SAMPLE.move}
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

        <section className="border-t border-border/60">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
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
        </section>
      </div>
    </div>
  );
}
