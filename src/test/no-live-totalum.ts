/**
 * b76 CI-TOTALUM: unit tests never reach the live Totalum API (data, cost, flakiness).
 * The SDK base URL points at a closed local port and the key is removed, so a test that forgets
 * to mock totalumSdk fails fast instead of reading or writing production rows.
 */
import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { expect } from "vitest";

export const BLOCKED_TOTALUM_URL = "http://127.0.0.1:9/";
process.env.TOTALUM_API_URL = BLOCKED_TOTALUM_URL;
delete process.env.TOTALUM_API_KEY;

const log = process.env.TOTALUM_BLOCK_LOG;
function note(target: string): void {
  if (!log) return;
  const name = expect.getState().testPath || "?";
  try { appendFileSync(log, `${name}\t${target}\n`); } catch { /* ignore */ }
}
function hits(target: string): boolean {
  return /api\.totalum\.app|127\.0\.0\.1:9\b/.test(target);
}
const realFetch = globalThis.fetch;
if (realFetch) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (hits(url)) { note(url); throw new TypeError(`blocked live Totalum call in a unit test: ${url}`); }
    return realFetch(input, init);
  }) as typeof fetch;
}
for (const mod of [http, https]) {
  const real = mod.request;
  (mod as { request: typeof real }).request = ((...args: unknown[]) => {
    const a = args[0] as { href?: string; host?: string; hostname?: string; port?: number | string } | string;
    const target = typeof a === "string" ? a : a?.href || `${a?.hostname || a?.host || ""}:${a?.port ?? ""}`;
    if (hits(target) || /^(api\.totalum\.app|127\.0\.0\.1:9)$/.test(target)) note(target);
    return (real as (...x: unknown[]) => unknown)(...args);
  }) as typeof real;
}
