import { redirect } from "next/navigation";

/** Older links used /ledger. The transaction centre lives on the dashboard. */
export default function LedgerRedirectPage() {
  redirect("/dashboard/transactions");
}
