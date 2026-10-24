/**
 * b63 (BACKLOG metals-500): a buy the book cannot afford is the caller's problem, not a server
 * fault. "Insufficient cash ..." from the ledger maps to 422 with the ledger's own message.
 */
export const INSUFFICIENT_CASH_CODE = "insufficient_cash";

export function isInsufficientCashError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /^insufficient cash/i.test(message.trim());
}

export function tradeErrorResponse(err: unknown, fallback: string): { status: number; body: { ok: false; error: string; data?: { code: string } } } {
  if (isInsufficientCashError(err)) {
    return { status: 422, body: { ok: false, error: (err as Error).message, data: { code: INSUFFICIENT_CASH_CODE } } };
  }
  const message = err instanceof Error && err.message ? err.message : fallback;
  return { status: 500, body: { ok: false, error: message } };
}
