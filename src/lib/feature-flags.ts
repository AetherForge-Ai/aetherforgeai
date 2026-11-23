/**
 * Must-fix flags (16 Oct 2026). Each one ships its approved default.
 * - LEDGER_ROW_EDIT (BL-7): single-row trade edit/delete with confirmation, audit
 *   line, FIFO/cash recompute and oversell guard. ON by default (approved);
 *   set LEDGER_ROW_EDIT=0 to switch it off.
 * - KOINS_MODEL_V2 (BL-9): PR #362 calibration. Off until the backtest passes.
 * - HEADMASTER_GOALS (H-11): off until the Totalum `goal` table exists.
 * - ULTIMATE_FEATURES (BL-6): seats, client portfolios and the API. Off.
 * - HOLDING_CAPS_V2 (G-07, b65): caps grid, no-card trial and refund text on /pricing, and the
 *   no-card trial at checkout. OFF until Lukas decides K-14/K-21; prices never change with it.
 * - TAX_SALE_PREVIEW (G-18, b79): "what if I sell" NZ tax preview at /tax/sale-preview. OFF in prod
 *   until the K-05 lawyer review (Lukas approved behind the flag, 27 Oct 2026). Set TAX_SALE_PREVIEW=1 to show.
 * - NZ_TAX_PREVIEW (NZ-TAX-PREVIEW-1): FIF "What if I sell?" on a holding at /tax/what-if-sell.
 *   Off unless the value trims to "1", TAX_SALE_PREVIEW is exactly "1" (the K-05 gate), and
 *   NZ_TAX_K05_K06_SIGNED_OFF is true. That constant stays false on every environment until Lukas
 *   signs off K-05 and K-06. NODE_ENV does not turn it on.
 *   Not set in deploy config. Reported on GET /api/health through the same check.
 * - IN_APP_BRIEFS (G-03) and IN_APP_ALERTS_V1 (G-04): in app only, off until K-05/K-12.
 */
const on = (name: string) => process.env[name] === "1";

export const LEDGER_ROW_EDIT = process.env.LEDGER_ROW_EDIT !== "0";
export const KOINS_MODEL_V2 = on("KOINS_MODEL_V2");
export const HEADMASTER_GOALS = on("HEADMASTER_GOALS");
export const ULTIMATE_FEATURES = on("ULTIMATE_FEATURES");
export const HOLDING_CAPS_V2 = on("HOLDING_CAPS_V2");
export const IN_APP_BRIEFS = on("IN_APP_BRIEFS");
export const IN_APP_ALERTS_V1 = on("IN_APP_ALERTS_V1");
/** Read per request so tests and preview deploys can switch it without a rebuild. */
export const taxSalePreviewEnabled = (env: Record<string, string | undefined> = process.env) => env.TAX_SALE_PREVIEW === "1";
/**
 * K-05 (lawyer) and K-06 (accountant) sign-off for the holding sale preview.
 * False until Lukas changes it. The same on every environment, including development and preview.
 */
export const NZ_TAX_K05_K06_SIGNED_OFF = false;

/** Tests only. Pages, routes and /api/health do not call this. Null uses the constant. */
let nzTaxPreviewSignOffForTests: boolean | null = null;

export function setNzTaxPreviewSignOffForTests(value: boolean | null): void {
  nzTaxPreviewSignOffForTests = value;
}

/** The sign-off constant only. NODE_ENV is not a fallback. */
export function nzTaxPreviewSignOff(): boolean {
  return nzTaxPreviewSignOffForTests ?? NZ_TAX_K05_K06_SIGNED_OFF;
}

/**
 * NZ-TAX-PREVIEW-1. On only when the flag trims to exactly "1", the K-05 sale-preview gate
 * passes, and the K-05/K-06 sign-off passes. Bracket access so the value is read per request.
 */
export function nzTaxPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const flagged = String(env["NZ_TAX_PREVIEW"] ?? "").trim() === "1";
  return flagged && taxSalePreviewEnabled(env) && nzTaxPreviewSignOff();
}
export { CSP_ALLOW_TOTALUM_TEST } from "@/lib/security-headers";
/**
 * b89 START-3: the "dip your toes in" offer on /start-here. OFF by default. Even when on, nothing shows
 * until DIP_CTA_CONFIG in src/lib/dip-cta.ts has a real amount and checkout link (Lukas decides; no
 * Stripe product or price exists for it yet).
 */
export const dipCtaEnabled = (env: Record<string, string | undefined> = process.env) => env.DIP_CTA === "1";
