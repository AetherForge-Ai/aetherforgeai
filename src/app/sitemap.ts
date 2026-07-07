import type { MetadataRoute } from "next";

// Public site base URL — configured app URL, else the production custom domain.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

/**
 * Sitemap for search engines. Lists the public, indexable routes.
 * Authenticated app routes (dashboard, settings, account) are intentionally excluded.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/about", "/how-it-works", "/pricing", "/login", "/register", "/privacy-policy", "/terms-of-service", "/ai-disclaimer"];
  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path === "" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
