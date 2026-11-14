import type { MetadataRoute } from "next";

// Public site base URL — configured app URL, else the production custom domain.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

/**
 * robots.txt — one User-agent group, the Disallow rules, and the sitemap line.
 * public/robots.txt must not shadow this file.
 * Do not set `host`. Next prints it as `Host: <url>`, which Google ignores and
 * which Yandex does not accept (it wants a bare hostname).
 * A second `User-agent: *` / `Allow: /` group is prepended by Cloudflare when
 * Bot Preference Sync is on. That switch is a zone setting, not this file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/settings", "/account", "/stripe/", "/import"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
