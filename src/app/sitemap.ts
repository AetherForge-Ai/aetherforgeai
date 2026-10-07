import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.aetherforgeai.co.nz";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/about",
    "/performance",
    "/how-it-works",
    "/pricing",
    "/markets",
    "/market-news",
    "/privacy-policy",
    "/terms-of-service",
    "/ai-disclaimer",
    "/trust",
    "/docs",
    "/blog",
    "/tax",
  ];
  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path === "" || path === "/performance" ? "daily" : "monthly",
    priority: path === "" ? 1 : path === "/performance" ? 0.9 : 0.6,
  }));
}