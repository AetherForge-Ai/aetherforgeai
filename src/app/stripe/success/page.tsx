"use client";

/**
 * Stripe Success Page — shown after a successful subscription checkout.
 * Redirects into the dashboard so the user lands on their portfolio.
 */

import { useEffect, useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { successCopyFor } from "@/lib/billing-guard";

function SuccessContent() {
  const [countdown, setCountdown] = useState(6);
  // b87 CR-1 F-2: copy from the plan this checkout was for (?plan= is set by the server's success_url).
  const copy = successCopyFor(useSearchParams().get("plan"));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = "/dashboard";
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-grid px-4">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/60 p-8 text-center backdrop-blur-xl shadow-glow">
        <div className="flex justify-center">
          <BrandLogo />
        </div>
        <div className="mx-auto mt-8 grid size-16 place-items-center rounded-2xl bg-emerald-500/15 text-gain">
          <CheckCircle2 className="size-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold">{copy.heading}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{copy.body}</p>

        {copy.showYearlyBox ? (
        <div data-yearly-box className="mt-5 rounded-2xl border border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4 text-left">
          <p className="text-sm font-semibold text-[var(--gold)]">Yearly plan</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            On a yearly plan? From your dashboard you can download the Excel investor toolkit
            template — a Portfolio Tracker and a Transactions spreadsheet. The file is a template.
            It is not filled with your holdings.
          </p>
        </div>
        ) : null}

        <Button asChild size="lg" className="mt-7 h-12 w-full font-semibold shadow-glow">
          <Link href="/dashboard">
            Go to dashboard <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">
          <Link href="/refunds" className="font-medium text-primary hover:underline">
            Refunds & Cancellations
          </Link>
        </p>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Redirecting in {countdown}s…
        </p>
      </div>
    </div>
  );
}

export default function StripeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
