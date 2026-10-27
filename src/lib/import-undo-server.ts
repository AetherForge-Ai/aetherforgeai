import "server-only";
import { totalumSdk } from "@/lib/totalum";

export { planImportUndo } from "@/lib/import-undo-plan";

/** b87 H-10: the stored paper cash, read fresh (the same figure the reversal apply path checks). */
export async function currentCashNzd(userId: string): Promise<number> {
  const res = await totalumSdk.crud.getRecordById("user", userId);
  return Number((res as { data?: { cash_balance?: number } })?.data?.cash_balance) || 0;
}
