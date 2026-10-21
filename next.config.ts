import type { NextConfig } from "next";
import { PORTFOLIO_ROUTE_ALIASES } from "./src/lib/portfolio-route-aliases";
import { PUBLIC_ROUTE_ALIASES } from "./src/lib/public-route-aliases";
import { CROSS_ORIGIN_ASSET_SOURCES, STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";


const nextConfig: NextConfig = {
  // b31 H-1/REG-1: metadata (including the x-af-snapshot-* meta tags) is rendered in <head>
  // for every client, not streamed after the body, so a slow stream never drops it.
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  // M-1: gzip responses this Node server generates (HTML and /_next/static).
  // This is already Next's default; it is set here so a later config cannot
  // turn it off by omission. It does not apply to a host that serves
  // /_next/static itself. See the PR for the Totalum and Cloudflare steps.
  compress: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(STATIC_SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
      },
      ...CROSS_ORIGIN_ASSET_SOURCES.map((source) => ({
        source,
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      })),
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placeholders.io",
      }
    ]
  },
  // b53a: the Totalum Cloudflare build of b53 was OOM-killed at "Checking validity of types".
  // CI's Typecheck job (tests.yml, tsc --noEmit) type-checks every PR, so the production build skips it.
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Dynamic dashboard RSC must not be replayed from the client router cache
    // after a paper-book switch. Static marketing prefetch keeps its default.
    staleTimes: {
      dynamic: 0,
    },
  },
  allowedDevOrigins: ["*"],
  async redirects() {
    return [
      { source: "/privacy", destination: "/privacy-policy", permanent: false },
      { source: "/terms", destination: "/terms-of-service", permanent: false },
      { source: "/faq", destination: "/pricing#faq", permanent: false },
      { source: "/features", destination: "/how-it-works", permanent: false },
      { source: "/try", destination: "/free-trial", permanent: false },
      { source: "/signup", destination: "/register", permanent: false },
      { source: "/holdings", destination: "/dashboard", permanent: false },
      { source: "/portfolio", destination: "/dashboard", permanent: false },
      { source: "/how", destination: "/how-it-works", permanent: false },
      { source: "/billing", destination: "/settings/billing", permanent: false },
      ...PORTFOLIO_ROUTE_ALIASES.map((row) => ({ ...row, permanent: false })),
      ...PUBLIC_ROUTE_ALIASES.map((row) => ({ ...row, permanent: false })),
    ];
  },
  // Cache-Control is applied once in middleware.ts.
  // Security headers are applied once in headers() above. Setting them in
  // middleware as well comma-joins the value (max-age=86400, max-age=86400).
  // b54b BUILD: Next 16 builds with Turbopack by default (Totalum runs plain `npx next build`). The b2x
  // webpack-only `[id]` trace workaround is not needed under Turbopack and was removed with the webpack hook.
  turbopack: {},
};

export default nextConfig;

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
// conditionally initialize based on environment variable
if (process.env.DISABLE_OPENNEXT !== 'true') {
  try {
    const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
    initOpenNextCloudflareForDev();
  } catch (error) {
    console.warn("OpenNext Cloudflare dev initialization failed:", error instanceof Error ? error.message : String(error));
    console.warn("Falling back to standard Next.js development mode");
  }
}
