import { isProtectedAccountApi } from "@/lib/session-owner";

/**
 * Marketing documents that do not read a session on the server.
  * Safe for a shared CDN cache. Anything that can paint a member — including
   * /markets and /dashboard — stays private, no-store.
    */
    const CACHEABLE_MARKETING_PATHS = new Set([
      "/",
        "/about",
          "/pricing",
            "/how-it-works",
              "/how-to-maximize-results",
                "/privacy-policy",
                  "/terms-of-service",
                    "/ai-disclaimer",
                      "/docs",
                        "/blog",
                          "/performance",
                            "/own-the-bots",
                            ]);
                            
                            const PRIVATE_APP_PREFIXES = [
                              "/dashboard",
                                "/notifications",
                                  "/alerts",
                                    "/transactions",
                                      "/settings",
                                        "/account",
                                          "/profile",
                                            "/onboarding",
                                              "/headmaster",
                                                "/totalum",
                                                ] as const;
                                                
                                                export const PUBLIC_MARKETING_CACHE_HEADERS: Record<string, string> = {
                                                  "Cache-Control": "public, max-age=0, s-maxage=120, stale-while-revalidate=600",
                                                    "CDN-Cache-Control": "public, s-maxage=120",
                                                      "Cloudflare-CDN-Cache-Control": "max-age=120",
                                                      };
                                                      
                                                      export function normalizePathname(pathname: string): string {
                                                        if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
                                                          return pathname;
                                                          }
                                                          
                                                          export function isCacheableMarketingPath(pathname: string): boolean {
                                                            return CACHEABLE_MARKETING_PATHS.has(normalizePathname(pathname));
                                                            }
                                                            
                                                            /** App shells whose HTML must never be stored or shared across sessions. */
                                                            export function isPrivateAppPath(pathname: string): boolean {
                                                              const path = norma
                                                              export function setCookieName(line: string): string {
                                                                const name = line.split("=", 1)[0] ?? "";
                                                                  return name.trim();
                                                                  }
                                                                  
                                                                  /**
                                                                   * A cookieless GET must not receive someone else's session cookie.
                                                                    * Sign-in POSTs, the OAuth callback, and logout are the writes that may.
                                                                     */
                                                                     export function anonymousResponseMaySetAuthCookie(pathname: string, method: string): boolean {
                                                                       const path = normalizePathname(pathname);
                                                                         const verb = method.toUpperCase();
                                                                           if (path === "/api/session/logout" || path === "/logout") return true;
                                                                             if (path.startsWith("/api/auth/callback")) return true;
                                                                               if (path.startsWith("/api/auth/") && verb === "POST") return true;
                                                                                 return false;
                                                                                 }
                                                                                 
                                                                                 export function filterAnonymousAuthSetCookies(
                                                                                   lines: readonly string[],
                                                                                     pathname: string,
                                                                                       method: string,
                                                                                         hasSessionToken: boolean,
                                                                                         ): string[] {
                                                                                           if (hasSessionToken || anonymousResponseMaySetAuthCookie(pathname, method)) return [...lines];
                                                                                             return lines.filter((line) => !AUTH_COOKIE_NAME.test(setCookieName(line)));
                                                                                             }
                                                                                             
                                                                                             const SHARED_CACHE_STATUS = new Set(["HIT", "STALE", "REVALIDATED", "UPDATING"]);
                                                                                             
                                                                                             /**
                                                                                              * True when this response was served from a shared cache.
                                       export function isSharedCacheReplay(
                                         headers: { get(name: string): string | null } | null | undefined,
                                         ): boolean {
                                           try {
                                               if (!headers || typeof headers.get !== "function") return false;
                                                   const status = (headers.get("cf-cache-status") || "").trim().toUpperCase();
                                                       if (SHARED_CACHE_STATUS.has(status)) return true;
                                                           const age = headers.get("age");
                                                               if (age != null && age.trim() !== "" && Number(age) > 0) return true;
                                                                   const xcache = (headers.get("x-cache") || "").toLowerCase();
                                                                       if (xcache.includes("hit")) return true;
                                                                           return false;
                                                                             } catch {
                                                                                 return false;
                                                                                   }
                                                                                   }
                                                                                   
                                                                                   /** Account JSON. A shared-cache replay of these URLs must not be painted. */
                                                                                   export function isAccountScopedClientUrl(url: string): boolean {
                                                                                     const path = normalizePathname(clientPathname(url));
                                                                                       if (path === "/api/session") return true;
                                                                                         return isProtectedAccountApi(path);
                                                                                         }
                                                                                         
                                                                                         function clientPathname(url: string): string {
                                                                                           const raw = url.split("?")[0] || "";
                                                                                             if (raw.startsWith("http://") || raw.startsWith("https://")) {
                                                                                                 try {
                                                                                                       return new URL(raw).pathname;
                                                                                                           } catch {
                                                                                                                 return raw;
                                                                                                                     }
                                                                                                                       }
                                                                                                                         return raw || "/";
                                                                                                                         }  images: {
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
  // Cache-Control is applied once in middleware.ts. A global headers()
  // entry was appended on top of that and duplicated the directive.
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
