import { redirect } from "next/navigation";

/** /billing lands on Plan & billing. next.config redirects here as well. */
export default function BillingAliasPage() {
  redirect("/settings/billing");
}
