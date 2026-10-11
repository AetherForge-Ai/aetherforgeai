import { AppShell } from "@/components/AppShell";
import { BrokerImportPanel } from "@/components/import/BrokerImportPanel";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/import", {
  title: "Import trades · AetherForge AI",
  description: "Review a Sharesies, Hatch, IBKR, or mapped CSV before it is saved to the paper book.",
});

export default async function ImportPage() {
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
      {user ? (
        <BrokerImportPanel />
      ) : (
        <div className="mx-auto max-w-xl px-4 py-16 text-sm text-muted-foreground">
          <h1 className="font-display text-3xl font-bold text-foreground">Import trades</h1>
          <p className="mt-4">
            <a className="font-semibold text-primary underline-offset-4 hover:underline" href="/login?redirect=%2Fimport">
              Sign in
            </a>{" "}
            to review a broker file before it is saved.
          </p>
        </div>
      )}
    </AppShell>
  );
}
