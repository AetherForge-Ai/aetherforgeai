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
export { CSP_ALLOW_TOTALUM_TEST } from "@/lib/security-headers";
/**
 * b89 START-3: the "dip your toes in" offer on /start-here. OFF by default. Even when on, nothing shows
 * until DIP_CTA_CONFIG in src/lib/dip-cta.ts has a real amount and checkout link (Lukas decides; no
 * Stripe product or price exists for it yet).
 */
export const dipCtaEnabled = (env: Record<string, string | undefined> = process.env) => env.DIP_CTA === "1";
