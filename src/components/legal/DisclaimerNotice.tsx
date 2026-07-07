import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Canonical, single-source financial disclaimer used sitewide so the wording
 * stays consistent and legally coherent everywhere it appears.
 *
 * New Zealand context: AetherForge AI (Forge Intelligence Ltd) is NOT a licensed
 * financial advice provider under the Financial Markets Conduct Act 2013 and does
 * not give a "financial advice service" as defined in that Act. Everything the
 * platform outputs is general information only — never a personalised
 * recommendation to acquire or dispose of a financial product. This component
 * keeps that statement front-of-mind on every surface that shows market data or
 * AI-generated analysis.
 *
 * Variants:
 *   • "bar"  — compact one/two-line strip for persistent page footers.
 *   • "full" — prominent bordered callout for pages that lead with figures.
 */
export function DisclaimerNotice({
  variant = "bar",
  className,
}: {
  variant?: "bar" | "full";
  className?: string;
}) {
  if (variant === "full") {
    return (
      <div
        className={cn(
          "rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 sm:p-5",
          className
        )}
        role="note"
        aria-label="Financial disclaimer"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
          <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="font-semibold text-foreground/90">
                Important — this is not financial advice.
              </strong>{" "}
              AetherForge AI (Forge Intelligence Ltd) provides general market information and
              AI-generated analysis for informational and educational purposes only. We are{" "}
              <strong className="text-foreground/90">not financial advisers</strong> and are{" "}
              <strong className="text-foreground/90">
                not a licensed financial advice provider
              </strong>{" "}
              under the Financial Markets Conduct Act 2013 (New Zealand). Nothing here takes into
              account your personal financial situation, goals or needs, and nothing here is a
              recommendation, opinion or offer to buy, sell or hold any share, digital asset or other
              financial product.
            </p>
            <p>
              Investing involves risk, including the loss of some or all of your capital; digital
              assets are especially volatile. Past performance is not a reliable indicator of future
              results, and AI output can be inaccurate. Always do your own research and seek advice
              from a licensed financial adviser before making any financial decision.{" "}
              <Link href="/ai-disclaimer" className="font-medium text-primary hover:underline">
                Read our full AI Disclaimer
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Compact strip — for footers across the app.
  return (
    <div
      className={cn(
        "border-t border-border/60 bg-background/60 px-4 py-3 text-center",
        className
      )}
      role="note"
      aria-label="Financial disclaimer"
    >
      <p className="mx-auto max-w-4xl text-[11px] leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground/80">Not financial advice.</strong>{" "}
        AetherForge AI (Forge Intelligence Ltd) provides general market information and AI-generated
        analysis for informational purposes only. We are not financial advisers and this is not
        licensed financial advice under the Financial Markets Conduct Act 2013 (NZ). It does not
        consider your personal circumstances and is not a recommendation to buy or sell any financial
        product. Investing carries risk, including loss of capital; past performance does not
        guarantee future results. Always do your own research and consult a licensed financial
        adviser.{" "}
        <Link href="/ai-disclaimer" className="font-medium text-primary hover:underline">
          Full disclaimer
        </Link>
        .
      </p>
    </div>
  );
}

export default DisclaimerNotice;
