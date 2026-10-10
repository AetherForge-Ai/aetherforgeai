import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { TaxPageContent } from "@/components/tax/TaxPageContent";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { loadTaxBookFigures } from "@/lib/tax-book-server";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/tax", {
  title: "Tax · AetherForge AI",
  description: "This is general information and not personal tax advice.",
});

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

  let book: { dividendsNzd: number; realisedPnlNzd: number } | null = null;
  if (user) {
    try {
      book = await loadTaxBookFigures(user._id);
    } catch {
      book = null;
    }
  }

  return (
    <AppShell user={shellUser} guest={!user}>
      <TaxPageContent book={book} />
    </AppShell>
  );
}
