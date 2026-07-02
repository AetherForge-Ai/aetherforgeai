import type { MetadataRoute } from "next";

// Public site base URL — configured app URL, else the production custom domain.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

/**
 * robots.txt — allow crawling of public pages, disallow the authenticated app
 * surface and API, and point crawlers to the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/settings", "/account", "/stripe/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
