import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FMC_STATEMENT,
  LONG_DISCLAIMER_HREF,
  LONG_DISCLAIMER_PARAGRAPHS,
} from "@/lib/disclaimer";
import { ONE_LINE_DISCLAIMER as SHORT_DISCLAIMER } from "@/lib/public-copy";

/**
 * CR-4: the one disclaimer component. The footer bar shows the short version and
 * links to the long version; the full callout shows the long version. The
 * Financial Markets Conduct sentence comes only from FMC_STATEMENT
 * ("not a licensed financial advice provider"). ONE_LINE_DISCLAIMER is the short version.
 */
export function FmcStatement({ className }: { className?: string }) {
  return <span className={className}>{FMC_STATEMENT}</span>;
}

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
          <div className="space-y-2 break-words text-sm leading-relaxed text-foreground">
            <p>
              <strong className="font-semibold text-foreground/90">
                Important — this is not financial advice.
              </strong>{" "}
              {SHORT_DISCLAIMER} <FmcStatement />
            </p>
            {LONG_DISCLAIMER_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
            <p>
              <Link href="/ai-disclaimer" className="font-medium text-primary underline-offset-2 hover:underline">
                Read the full AI Disclaimer
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Short version for page footers. The long version is one click away.
  return (
    <div
      className={cn(
        "border-t border-border/60 bg-background/60 px-4 py-3 text-center",
        className
      )}
      role="note"
      aria-label="Financial disclaimer"
    >
      <p className="mx-auto max-w-4xl break-words text-sm leading-relaxed text-foreground">
        <strong className="font-semibold text-foreground/80">Not financial advice.</strong>{" "}
        {SHORT_DISCLAIMER}{" "}
        <Link href="/trust" className="font-medium text-primary hover:underline inline-flex min-h-11 items-center md:min-h-0">
          How the books work
        </Link>
        {" · "}
        <Link href={LONG_DISCLAIMER_HREF} className="font-medium text-primary hover:underline inline-flex min-h-11 items-center md:min-h-0">
          Full disclaimer
        </Link>
        .
      </p>
    </div>
  );
}

export default DisclaimerNotice;
