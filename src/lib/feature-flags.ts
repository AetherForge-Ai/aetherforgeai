/**
 * Must-fix flags (16 Oct 2026). Each one ships its approved default.
 * - LEDGER_ROW_EDIT (BL-7): single-row trade edit/delete with confirmation, audit
 *   line, FIFO/cash recompute and oversell guard. ON by default (approved);
 *   set LEDGER_ROW_EDIT=0 to switch it off.
 * - KOINS_MODEL_V2 (BL-9): PR #362 calibration. Off until the backtest passes.
 * - HEADMASTER_GOALS (H-11): off until the Totalum `goal` table exists.
 * - ULTIMATE_FEATURES (BL-6): seats, client portfolios and the API. Off.
 * - IN_APP_BRIEFS (G-03) and IN_APP_ALERTS_V1 (G-04): in app only, off until K-05/K-12.
 */
const on = (name: string) => process.env[name] === "1";

export const LEDGER_ROW_EDIT = process.env.LEDGER_ROW_EDIT !== "0";
export const KOINS_MODEL_V2 = on("KOINS_MODEL_V2");
export const HEADMASTER_GOALS = on("HEADMASTER_GOALS");
export const ULTIMATE_FEATURES = on("ULTIMATE_FEATURES");
export const IN_APP_BRIEFS = on("IN_APP_BRIEFS");
export const IN_APP_ALERTS_V1 = on("IN_APP_ALERTS_V1");
export { CSP_ALLOW_TOTALUM_TEST } from "@/lib/security-headers";
