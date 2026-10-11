import { PRICING_FAQS } from "@/lib/pricing-faq";

/**
 * Searchable help entries. Docs links and the pricing questions.
 * No response-time promise is added here.
 *
 * pull-check:batch2-2026-10-11 B2-12
 */

export interface HelpArticle {
  href: string;
  title: string;
  body: string;
}

export const DOC_LINKS: HelpArticle[] = [
  {
    href: "/how-it-works",
    title: "How it works",
    body: "You buy through your own broker. You enter what you hold. Stox and Koins analyse it. You keep custody of every asset.",
  },
  {
    href: "/returns",
    title: "Return",
    body: "Money-weighted return, time-weighted return, and a benchmark bought on your deposit dates. A figure is shown only with a valuation, an as-of date, and a source.",
  },
  {
    href: "/ai-disclaimer",
    title: "AI disclaimer",
    body: "General information only. Not licensed financial advice under the Financial Markets Conduct Act 2013.",
  },
  {
    href: "/pricing#faq",
    title: "Pricing questions",
    body: "Answers about plans live on the pricing page.",
  },
  {
    href: "/projections",
    title: "Projections methodology",
    body: "Weekly top projections. That page includes a Methodology note on how the 7-day outlook is built. It is not personalised advice.",
  },
  {
    href: "/about",
    title: "About and contact",
    body: "The company story, and how to email or call FORGE INTELLIGENCE LIMITED.",
  },
  {
    href: "/privacy-policy",
    title: "Privacy policy",
    body: "How account data is handled under the Privacy Act 2020.",
  },
  {
    href: "/terms-of-service",
    title: "Terms",
    body: "The terms that apply to using AetherForge AI.",
  },
];

export function helpArticles(): HelpArticle[] {
  return [
    ...DOC_LINKS,
    ...PRICING_FAQS.map((faq) => ({ href: "/pricing#faq", title: faq.q, body: faq.a })),
  ];
}

export function searchHelp(query: string, articles: readonly HelpArticle[] = helpArticles()): HelpArticle[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...articles];
  return articles.filter((article) => `${article.title} ${article.body}`.toLowerCase().includes(needle));
}
