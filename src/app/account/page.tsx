import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/account", {
  title: "Account · AetherForge AI",
  description: "Your AetherForge account. Settings live on this book.",
});

/** /account is settings. Signed-out visits go to login, not the app shell. */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings");
  redirect("/settings");
}
