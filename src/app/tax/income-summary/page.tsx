import { redirect } from "next/navigation";

/** Older links used this path. The income summary lives at /tax/income. */
export default function TaxIncomeSummaryPage() {
  redirect("/tax/income");
}
