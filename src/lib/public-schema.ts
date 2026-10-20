/**
 * Public JSON-LD. No review or rating type: there is no published review set.
 *
 * pull-check:batch2-2026-10-11 B2-11
 */

import { PRICING_TIERS } from "@/lib/plans";
import { PRICING_FAQS } from "@/lib/pricing-faq";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz").replace(/\/$/, "");

export function absoluteUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function breadcrumbJsonLd(items: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      // Goal b11 G-15: Rich Results needs an absolute URL for each crumb.
      // b38 G-15: the item itself carries the name too (validators showed "Unnamed item").
      item: { "@type": "WebPage", "@id": absoluteUrl(item.path), name: item.name },
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

/**
 * b38 G-15: FAQPage for /help, built only from the Q&A the page actually shows (help entries whose
 * title is a question). No rating or review markup anywhere.
 */
export function helpFaqJsonLd(articles: readonly { title: string; body: string }[]) {
  const qa = articles.filter((a) => a.title.trim().endsWith("?") && a.body.trim());
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((a) => ({ "@type": "Question", name: a.title, acceptedAnswer: { "@type": "Answer", text: a.body } })),
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
