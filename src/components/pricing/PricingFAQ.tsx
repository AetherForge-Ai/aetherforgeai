"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { REFUND_FAQ, TRIAL_FAQ } from "@/lib/public-copy";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Can I switch between monthly and annual billing?",
    a: "Yes. You can move from monthly to annual (or back) at any time from your billing settings. When you switch to annual you immediately lock in the 16.67% saving, and any unused time on your current period is prorated toward the new plan automatically via Stripe.",
  },
  {
    q: "What happens when I hit my report or holding limits?",
    a: "Nothing breaks — you keep full access to everything you've already created. When you pass a Free or Starter allowance, the prompt points to Pro. Pro and above can talk to us about a founder-led Ultimate setup. Self-serve upgrades take effect through Stripe.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Absolutely. Upgrade at any time and you're charged only the prorated difference for the rest of your billing period. Downgrades take effect at the end of your current period so you never lose time you've paid for.",
  },
  {
    q: "Do you offer refunds?",
    a: REFUND_FAQ,
  },
  {
    q: "What is included with The Headmaster?",
    a: "The Headmaster handles Portfolio Planning and Strategies — the cross-asset intelligence layer that looks at your entire portfolio (equities and crypto together), models strategy, runs risk and stress tests, and maps forward pathways. Starter includes basic Headmaster insights; Pro and Ultimate unlock the full planner.",
  },
  {
    q: "Is there a difference between Stox and Koins?",
    a: "Yes. Stox is our equities engine covering NZX, ASX and global markets, while Koins is our dedicated crypto-intelligence engine. On Free and Starter you choose one; on Pro and Ultimate you get full access to both, working together through The Headmaster.",
  },
  {
    q: "Can I try Pro before committing?",
    a: TRIAL_FAQ,
  },
  {
    q: "Do you have discounts for students or charities?",
    a: "We do. If you're a student, educator, registered charity or not-for-profit, get in touch with your details and we'll arrange a meaningful discount on any paid tier.",
  },
  {
    q: "How does billing work with annual plans?",
    a: "Annual plans are billed once up front: 12 months for the price of 10, a 16.67% saving versus paying monthly. Your plan renews automatically each year, and you can cancel or switch to monthly at any time.",
  },
  {
    q: "What kind of support do I get on each plan?",
    a: "Every plan — including Free — includes email support. Pro adds priority support with faster response times, and Ultimate includes a dedicated account manager plus scheduled strategy consultation calls.",
  },
];

export function PricingFAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div id="faq" className="mx-auto max-w-3xl scroll-mt-24">
      <div className="mb-8 text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Frequently asked questions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything you need to know about plans, billing and features.
        </p>
      </div>

      <div className="space-y-3">
        {FAQS.map((faq, i) => {
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
