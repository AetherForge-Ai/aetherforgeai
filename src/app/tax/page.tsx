import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { TaxPageContent } from "@/components/tax/TaxPageContent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "TAX · AetherForge AI",
  description:
    "General information on New Zealand tax for a paper portfolio, drawn from Inland Revenue. Not personal tax advice.",
};

export default async function TaxPage() {
  const user = await getCurrentUser();
  const shellUser = user
    ? {
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }
    : { name: "Guest", email: "Sign in to activate your account" };

  return (
    <AppShell user={shellUser} guest={!user}>
      <TaxPageContent />
    </AppShell>
  );
}
