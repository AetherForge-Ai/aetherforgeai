import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/profile", {
  title: "Profile · AetherForge AI",
  description: "Your AetherForge profile. Account settings live under Settings.",
});

// Profile management lives in settings. Signed-out visits go to login.
export default async function ProfileRedirectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings");
  redirect("/settings");
}
