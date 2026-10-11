"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRICING_FAQS } from "@/lib/pricing-faq";
import { REFUND_FAQ, TRIAL_FAQ } from "@/lib/public-copy";

export function PricingFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div
      id="faq"
      className="mx-auto max-w-3xl scroll-mt-24"
      data-policy={PRICING_FAQS.some((faq) => faq.a === REFUND_FAQ || faq.a === TRIAL_FAQ) ? "yes" : "no"}
    >
      <div className="mb-8 text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Frequently asked questions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything you need to know about plans, billing and features.
        </p>
      </div>

      <div className="space-y-3">
        {PRICING_FAQS.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div
              key={faq.q}
              className={cn(
                "overflow-hidden rounded-2xl border transition-colors",
                isOpen ? "border-primary/40 bg-card/60" : "border-border/70 bg-card/30 hover:border-primary/30"
              )}
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="font-display text-sm font-semibold sm:text-base">{faq.q}</span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180 text-primary"
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-200 ease-out",
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
