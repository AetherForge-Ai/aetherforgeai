import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { FmcStatement } from "@/components/legal/DisclaimerNotice";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { DATA_TOO_OLD_HOLD, STALE_TRADING_DAYS } from "@/lib/market-intel";

export const metadata = publicPageMetadata("/methodology", {
  title: "How Stox and Koins work out a score · AetherForge AI",
  description:
    "Plain-English method behind the Stox and Koins scores: the inputs, the data-quality gates, and what the score does not tell you.",
});

const STEPS = [
  {
    title: "1. Prices and history",
    body: "Each score starts from a delayed or closing price and the recent daily closes for the same name. Sources and delays are listed on the Trust page.",
  },
  {
    title: "2. Data-quality gates",
    body: `A name with fewer than 40 daily closes gets no score. A name whose last price is more than ${STALE_TRADING_DAYS} trading days old shows “${DATA_TOO_OLD_HOLD}” instead of a score.`,
  },
  {
    title: "3. Indicators",
    body: "The engine reads trend (20- and 50-day averages), momentum (RSI and MACD), position in the Bollinger band, and volatility (average true range). These readings are combined into one figure.",
  },
  {
    title: "4. The score and the range",
    body: "The result is a 0–100 indicator and an illustrative 7-day range. It is a rules-based calculation, not a forecast of what will happen, and it does not know your goals or tax position.",
  },
  {
    title: "5. The written note",
    body: "A third-party AI service turns the calculated figures into a short plain-English note. It is labelled “AI-written note”. It does not change the score.",
  },
] as const;

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">How a score is worked out</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Stox (shares) and Koins (crypto) use the same rules-based engine. This page explains the inputs and the limits.
        </p>
        {STEPS.map((step) => (
          <section key={step.title} className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">{step.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </section>
        ))}
        <section className="mt-8 space-y-2">
          <h2 className="font-display text-lg font-bold">Backtests and accuracy</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We have not published a backtest yet, so we make no claim about how often a score has been right. When we
            publish one it will cover good and bad periods, and it will be dated on this page.
          </p>
        </section>
        <section className="mt-8 space-y-2">
          <h2 className="font-display text-lg font-bold">Read more</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <Link href="/trust" className="font-semibold text-primary hover:underline">Trust: data sources and delays</Link>
            {" · "}
            <Link href="/ai-disclaimer" className="font-semibold text-primary hover:underline">AI disclaimer</Link>
          </p>
        </section>
        <div className="mt-10">
          <FmcStatement />
        </div>
      </main>
    </div>
  );
}
