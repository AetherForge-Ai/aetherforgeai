import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import { anonymousResponseMaySetAuthCookie } from "./src/lib/private-document";

const cloudflare = defineCloudflareConfig({
  // Uncomment to enable R2 cache,
  // It should be imported as:
  // `import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";`
  // See https://opennext.js.org/cloudflare/caching for more details
  // incrementalCache: r2IncrementalCache,
});

export default {
  ...cloudflare,
  dangerous: {
    ...cloudflare.dangerous,
    // Middleware Set-Cookie wins over a cookie the page handler attaches.
    // Anonymous requests clear the auth cookies in middleware, so a session
    // planted during render cannot be stored by the browser. Auth writes
    // (sign-in, OAuth callback, logout) keep the handler cookie.
    headersAndCookiesPriority(event: { rawPath?: string; method?: string }) {
      const path = (event.rawPath ?? "").split("?")[0] || "/";
      const method = (event.method ?? "GET").toUpperCase();
      // Auth writes keep the handler's Set-Cookie. Every other response lets
      // the middleware cookie (a clear, for anonymous requests) come last.
      if (anonymousResponseMaySetAuthCookie(path, method)) return "handler" as const;
      return "middleware" as const;
    },
  },
};
