import { EMAIL_SUPPORT_LINE, REFUND_FAQ, TRIAL_FAQ } from "@/lib/public-copy";

/** Visible pricing questions. Help search uses this same list. */
export const PRICING_FAQS: { q: string; a: string }[] = [
  {
    q: "Can I switch between monthly and annual billing?",
    a: "Yes. You can move from monthly to annual (or back) at any time from Plan & billing in Settings (/settings/billing). When you switch to annual you immediately lock in the 16.67% saving, and any unused time on your current period is prorated toward the new plan automatically via Stripe.",
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
    a: `${EMAIL_SUPPORT_LINE} Pro adds priority support with faster response times, and Ultimate includes a dedicated account manager plus scheduled strategy consultation calls.`,
  },
];
