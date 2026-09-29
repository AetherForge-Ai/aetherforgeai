import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placeholders.io",
      }
    ]
  },
  eslint: {
    ignoreDuringBuilds: true,
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
      { source: "/contact", destination: "/about#contact", permanent: false },
      { source: "/faq", destination: "/pricing#faq", permanent: false },
      { source: "/features", destination: "/how-it-works", permanent: false },
      { source: "/try", destination: "/free-trial", permanent: false },
      { source: "/signup", destination: "/register", permanent: false },
      { source: "/stox", destination: "/dashboard/stocks", permanent: false },
      { source: "/koins", destination: "/dashboard/crypto", permanent: false },
      { source: "/smitty", destination: "/dashboard/metals", permanent: false },
      { source: "/holdings", destination: "/dashboard", permanent: false },
      { source: "/portfolio", destination: "/dashboard", permanent: false },
      { source: "/how", destination: "/how-it-works", permanent: false },
    ];
  },
  async headers() {
    // Only cache-control headers here. CSP and CORS are handled exclusively in middleware.ts
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          '**/.git/**',
          '**/playwright-screenshots/**',
          '**/.playwright-mcp/**',
          '**/playwright-dev-server.log',
          '**/npm-start.log',
          '**/frontend.log',
          '**/project-docs/**',
        ],
      };
    }
    return config;
  },
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
