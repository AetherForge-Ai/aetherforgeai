/**
 * Must-fix flags (16 Oct 2026). Each one ships its approved default.
 * - LEDGER_ROW_EDIT (BL-7): single-row trade edit/delete. Approved default is on,
 *   but the trade edit/delete path is not finished (TT recorded it as broken), so it
 *   stays off until it passes; dividends already have edit and a confirmed delete.
 * - KOINS_MODEL_V2 (BL-9): PR #362 calibration. Off until the backtest passes.
 * - HEADMASTER_GOALS (H-11): off until the Totalum `goal` table exists.
 * - ULTIMATE_FEATURES (BL-6): seats, client portfolios and the API. Off.
 */
const on = (name: string) => process.env[name] === "1";

export const LEDGER_ROW_EDIT = on("LEDGER_ROW_EDIT");
export const KOINS_MODEL_V2 = on("KOINS_MODEL_V2");
export const HEADMASTER_GOALS = on("HEADMASTER_GOALS");
export const ULTIMATE_FEATURES = on("ULTIMATE_FEATURES");
export { CSP_ALLOW_TOTALUM_TEST } from "@/lib/security-headers";
