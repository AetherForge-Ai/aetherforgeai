import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** /account is settings. Signed-out visits go to login, not the app shell. */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings");
  redirect("/settings");
}
