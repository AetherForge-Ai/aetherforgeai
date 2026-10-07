import type { NextConfig } from "next";
import { PORTFOLIO_ROUTE_ALIASES } from "./src/lib/portfolio-route-aliases";
import { PUBLIC_ROUTE_ALIASES } from "./src/lib/public-route-aliases";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

type DynamicSegmentAsset = { source: () => string | Buffer };
type DynamicSegmentChunk = { id?: string | number };
type DynamicSegmentEntrypoint = {
  name?: string;
  getEntrypointChunk: () => DynamicSegmentChunk;
};
type DynamicSegmentCompilation = {
  entrypoints: { values: () => Iterable<DynamicSegmentEntrypoint> };
  hooks: {
    processAssets: {
      tap: (opts: { name: string; stage: number }, fn: () => void) => void;
    };
  };
  getAsset: (name: string) => DynamicSegmentAsset | undefined;
  getPath: (name: string, data: { chunk: DynamicSegmentChunk }) => string;
  renameAsset: (from: string, to: string) => void;
  emitAsset: (name: string, source: unknown) => void;
};

const DYNAMIC_SEGMENT_SUFFIXES = [
  ".js.nft.json",
  ".js",
  "_client-reference-manifest.js",
] as const;

function preserveDynamicSegmentTraces(
  compilation: DynamicSegmentCompilation,
  webpack: { sources: { RawSource: new (source: string) => unknown } },
) {
  for (const entrypoint of compilation.entrypoints.values()) {
    const entryName = entrypoint.name;
    if (!entryName?.includes("[id]")) continue;
    const chunk = entrypoint.getEntrypointChunk();
    for (const suffix of DYNAMIC_SEGMENT_SUFFIXES) {
      const literal = `../${entryName}${suffix}`;
      let substituted = literal;
      try {
        substituted = compilation.getPath(literal, { chunk });
      } catch {
        const id = chunk?.id;
        if (id !== undefined && id !== null) {
          substituted = literal.replaceAll("[id]", String(id));
        }
      }
      if (compilation.getAsset(literal)) continue;
      if (substituted !== literal && compilation.getAsset(substituted)) {
        compilation.renameAsset(substituted, literal);
        continue;
      }
      if (suffix !== ".js.nft.json") continue;
      compilation.emitAsset(
        literal,
        new webpack.sources.RawSource(JSON.stringify({ version: 1, files: [] })),
      );
    }
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
      },
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
      ...PORTFOLIO_ROUTE_ALIASES.map((row) => ({ ...row, permanent: false })),
      ...PUBLIC_ROUTE_ALIASES.map((row) => ({ ...row, permanent: false })),
    ];
  },
  // Cache-Control is applied once in middleware.ts.
  // Security headers are applied once in headers() above. Setting them in
  // middleware as well comma-joins the value (max-age=86400, max-age=86400).
  webpack: (config, { dev, isServer, nextRuntime, webpack }) => {
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
    // Webpack's path templating treats `[id]` as the chunk id. Next asks
    // collect-build-traces for `.next/server/app/api/alerts/[id]/route.js.nft.json`,
    // but a second template pass (or an asset rename) writes that trace under
    // the numeric chunk id instead. Alerts is the first `[id]` route, so the
    // build dies there with ENOENT. Put the literal file back before emit.
    if (isServer && !dev && nextRuntime === "nodejs") {
      config.plugins.push({
        apply(compiler: {
          hooks: {
            thisCompilation: {
              tap: (name: string, fn: (compilation: DynamicSegmentCompilation) => void) => void;
            };
          };
        }) {
          compiler.hooks.thisCompilation.tap("PreserveDynamicSegmentTraces", (compilation) => {
            compilation.hooks.processAssets.tap(
              {
                name: "PreserveDynamicSegmentTraces",
                stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
              },
              () => {
                preserveDynamicSegmentTraces(compilation, webpack);
              },
            );
          });
        },
      });
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
