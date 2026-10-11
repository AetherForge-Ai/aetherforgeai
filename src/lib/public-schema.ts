/**
 * Public JSON-LD. No review or rating type: there is no published review set.
 *
 * pull-check:batch2-2026-10-11 B2-11
 */

import { PRICING_TIERS } from "@/lib/plans";
import { PRICING_FAQS } from "@/lib/pricing-faq";

export function breadcrumbJsonLd(items: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.path,
    })),
  };
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PRICING_FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}

/** Monthly published prices only. All prices in NZD. */
export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AetherForge AI",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: "Paper portfolio tools. All prices in NZD.",
    offers: PRICING_TIERS.map((tier) => ({
      "@type": "Offer",
      name: tier.name,
      price: String(tier.monthlyPrice ?? 0),
      priceCurrency: "NZD",
    })),
  };
}
