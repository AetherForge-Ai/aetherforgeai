/**
 * Optional CoinGecko key. Keyless calls stay the fallback.
 *
 * COINGECKO_API_KEY is read from the host environment (Totalum env on production).
 * It is sent as a header and is never written to a log, a URL, or a response.
 * COINGECKO_PRO=on uses the Pro host and x-cg-pro-api-key.
 * Any other value, including unset, uses the public host.
 * A demo key uses x-cg-demo-api-key on https://api.coingecko.com.
 *
 * pull-check:crypto-live-2026-10-11
 */

export const COINGECKO_PUBLIC_BASE = "https://api.coingecko.com/api/v3";
export const COINGECKO_PRO_BASE = "https://pro-api.coingecko.com/api/v3";

export type CoinGeckoMode = "keyless" | "demo" | "pro";

export interface CoinGeckoEndpoint {
  base: string;
  headers: Record<string, string>;
  mode: CoinGeckoMode;
}

function flagOn(value: string | undefined): boolean {
  const raw = (value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/** Header map for one call. `keyless` drops the key so a rejected key can be retried. */
export function coinGeckoEndpoint(env: NodeJS.ProcessEnv = process.env, keyless = false): CoinGeckoEndpoint {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = (env.COINGECKO_API_KEY || "").trim();
  if (!key || keyless) return { base: COINGECKO_PUBLIC_BASE, headers, mode: "keyless" };
  if (flagOn(env.COINGECKO_PRO)) {
    headers["x-cg-pro-api-key"] = key;
    return { base: COINGECKO_PRO_BASE, headers, mode: "pro" };
  }
  headers["x-cg-demo-api-key"] = key;
  return { base: COINGECKO_PUBLIC_BASE, headers, mode: "demo" };
}

/** Remove the configured key from a log line. The key itself is not logged. */
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = (env.COINGECKO_API_KEY || "").trim();
  const cut = text.slice(0, 180);
  if (!key) return cut;
  return cut.split(key).join("[redacted]");
}
