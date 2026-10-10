import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { pageTitle } from "@/lib/page-title";
import { publicScorecard } from "@/lib/forecast-store";
import { CRYPTO_PROJECTIONS_PAUSE_MESSAGE } from "@/lib/projection-pause";
import { MIN_RESOLVED_FOR_BAND, MIN_RESOLVED_FOR_RATE } from "@/lib/forecast-scorecard";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/track-record", {
  title: pageTitle("Track record"),
  description:
    "A public log of Stox and Koins forecasts and the later prices recorded against them. The page starts empty. General information, not personal advice.",
});

function count(n: number | null): string {
  return typeof n === "number" ? String(n) : "—";
}

function rate(n: number | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `${(n * 100).toFixed(1)}%`;
}

export default function TrackRecordPage() {
  const card = publicScorecard();
  const showCounts = card.status !== "unverified";
  const hit = rate(card.hitRate);
  const low = rate(card.wilson?.low ?? null);
  const high = rate(card.wilson?.high ?? null);
  const brier = typeof card.brier === "number" ? card.brier.toFixed(3) : null;
  const brierNaive = typeof card.brierNaive === "number" ? card.brierNaive.toFixed(3) : null;
  const brierHold = typeof card.brierBuyHold === "number" ? card.brierBuyHold.toFixed(3) : null;

  return (
    <div className="relative min-h-screen bg-background bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">AetherForge AI · Forecasts</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Track record</h1>
          <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              This page scores forecasts after Stox or Koins has shown them and a later price has been
              written on the log. It starts empty. A figure appears only as a count from that log.
            </p>
            <p>
              Each line is append-only. The line&apos;s hash covers the previous line, so a changed
              line breaks the chain. Outcomes are later lines. A forecast line is not edited when the
              outcome arrives.
            </p>
            <p>
              A hit is a directional forecast whose later price moved the way the range sat. A no-edge
              line is counted and left out of the hit rate. The interval is a Wilson interval.
              The Brier score is the average squared gap between a stated probability and what happened.
              The naive line uses the prior session&apos;s direction. Buy-and-hold on the same names
              is an always-up score of those same forecasts. {CRYPTO_PROJECTIONS_PAUSE_MESSAGE}
            </p>
            <p>
              Share prices are public market data (Yahoo Finance), delayed. Not a direct NZX or ASX feed. This is general information, not personal advice, and not a guarantee.
            </p>
          </div>

          <section className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-5" aria-labelledby="track-status">
            <h2 id="track-status" className="font-display text-2xl font-bold">
              {card.status === "scored" ? "Logged forecasts" : "Not enough data yet"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.message}</p>
            {card.edgeNote ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.edgeNote}</p> : null}
            {card.chainError ? <p className="mt-2 text-sm text-muted-foreground">{card.chainError}</p> : null}

            {showCounts ? (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Forecasts logged</dt>
                  <dd className="mt-1 font-mono text-lg">{count(card.logged)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">With a later price</dt>
                  <dd className="mt-1 font-mono text-lg">{count(card.resolved)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Still open</dt>
                  <dd className="mt-1 font-mono text-lg">{count(card.open)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">No-edge lines</dt>
                  <dd className="mt-1 font-mono text-lg">{count(card.abstained)}</dd>
                </div>
              </dl>
            ) : null}

            {card.status === "scored" && hit && low && high ? (
              <dl className="mt-6 space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Hit rate, directional forecasts only</dt>
                  <dd className="mt-1 font-mono">
                    {hit} ({card.hits} of {card.directionalResolved}). Wilson interval {low} to {high}.
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Brier score</dt>
                  <dd className="mt-1 font-mono">
                    {brier ?? `Not enough data yet. A Brier score needs at least ${MIN_RESOLVED_FOR_RATE} stated probabilities.`}
                    {brier && card.brierCount != null ? ` (${card.brierCount} stated probabilities).` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Naive, prior session direction</dt>
                  <dd className="mt-1 font-mono">
                    {brierNaive
                      ? `${brierNaive}${rate(card.naiveHitRate) ? `, hit rate ${rate(card.naiveHitRate)}` : ""} (${card.naiveCount} rows).`
                      : "Not enough data yet."}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Buy-and-hold on the same names</dt>
                  <dd className="mt-1 font-mono">
                    {brierHold
                      ? `${brierHold}${rate(card.buyHoldHitRate) ? `, always-up hit rate ${rate(card.buyHoldHitRate)}` : ""}.`
                      : "Not enough data yet."}
                  </dd>
                </div>
              </dl>
            ) : null}

            {card.status === "not-enough" ? (
              <p className="mt-4 text-sm text-muted-foreground">
                A hit rate waits until {MIN_RESOLVED_FOR_RATE} directional forecasts have a later price.
                A calibration band waits until {MIN_RESOLVED_FOR_BAND} resolved forecasts sit in that band.
              </p>
            ) : null}

            {card.calibration.length ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Realised frequency by model-fit band</h3>
                <table className="mt-2 w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Band</th>
                      <th className="py-1 pr-3 font-medium">Resolved</th>
                      <th className="py-1 font-medium">Up afterwards</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.calibration.map((band) => (
                      <tr key={band.band} className="border-t border-border/60">
                        <td className="py-1.5 pr-3 font-mono">{band.band}</td>
                        <td className="py-1.5 pr-3 font-mono">{band.n}</td>
                        <td className="py-1.5 font-mono">{rate(band.realised)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Not enough data yet for a calibration table.</p>
            )}

            <p className="mt-6 text-sm leading-relaxed">
              <Link href="/api/track-record/log" className="font-medium text-primary hover:underline">
                Download the log
              </Link>
              . An empty file is a chain with nothing to check.
            </p>
          </section>

          <p className="mt-8 text-sm text-muted-foreground">
            <Link href="/performance" className="font-medium text-primary hover:underline">
              Example results
            </Link>{" "}
            is a dated paper-book sample. It is not this log.{" "}
            <Link href="/ai-disclaimer" className="font-medium text-primary hover:underline">
              AI disclaimer
            </Link>
            .
          </p>
          <DisclaimerNotice variant="full" className="mt-8" />
        </article>
      </div>
    </div>
  );
}
