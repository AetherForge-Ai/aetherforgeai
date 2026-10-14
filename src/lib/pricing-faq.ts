import { ANNUAL_REFUND_RULE, EMAIL_SUPPORT_LINE, MONTHLY_CANCEL_RULE, REFUND_FAQ, TRIAL_FAQ } from "@/lib/public-copy";

/** Visible pricing questions. FAQ schema and help search use this same list. */
export const PRICING_FAQS: { q: string; a: string }[] = [
  {
    q: "Can I switch between monthly and annual billing?",
    a: "Yes. You can move from monthly to annual billing from Plan & billing in Settings (/settings/billing). Annual billing is 12 months for the price of 10 (save 2 months, about 17%). Moving from annual to monthly takes effect at your next renewal. Refunds follow the Refunds & Cancellations policy: an annual charge can be refunded in full only if you cancel within 14 days of it; after that there is no refund, and you keep access until the end of the paid year.",
  },
  {
    q: "What happens when I hit my report or holding limits?",
    a: "Nothing breaks — you keep full access to everything you've already created. When you pass a Free or Starter allowance, the prompt points to Pro. Pro and above can talk to us about a founder-led Ultimate setup. Self-serve upgrades take effect through Stripe.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Absolutely. Upgrade at any time and you're charged only the prorated difference for the rest of your billing period. Downgrades take effect at the end of your current period. No refund is given for the rest of a period except as set out in the Refunds & Cancellations policy.",
  },
  {
    q: "Do you offer refunds?",
    a: `${REFUND_FAQ} ${ANNUAL_REFUND_RULE} ${MONTHLY_CANCEL_RULE}`,
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
    q: "How does billing work with annual plans?",
    a: "Annual plans are billed once up front: 12 months for the price of 10. Save 2 months (≈17%) versus paying monthly. Your plan renews automatically each year. You can cancel at any time so it does not renew; a full refund applies only within 14 days of the annual charge or renewal, as set out in the Refunds & Cancellations policy.",
  },
  {
    q: "What kind of support do I get on each plan?",
    a: `${EMAIL_SUPPORT_LINE} Pro adds priority support with faster response times, and Ultimate includes dedicated email support.`,
  },
];
