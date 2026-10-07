import { redirect } from "next/navigation";
import { getCurrentUser, isStripeConfigured } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { headmasterDepth } from "@/lib/entitlements";
import { AppShell } from "@/components/AppShell";
import { TotalumConsole } from "@/components/totalum/TotalumConsole";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/headmaster", {
  title: "The Headmaster · AetherForge AI",
  description: "Portfolio planning and strategies for your AetherForge paper book.",
});

/**
 * The Headmaster — Portfolio Planning and Strategies.
 * Canonical console route. The legacy /totalum path redirects here.
 */
export default async function HeadmasterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/headmaster");

  // Any logged-in member can open the page. Free sees the upsell when Stripe is
  // configured. Starter gets the basic desk. Demo mode (no Stripe key) stays open.
  const depth = !isStripeConfigured() ? "full" : headmasterDepth(user.subscription_plan);
  const entitled = depth !== "none";
  console.log(`[headmaster] Rendering console for user ${user._id} (depth=${depth})`);

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      <div className="p-4 md:p-8">
        <TotalumConsole entitled={entitled} depth={depth} memberName={user.name} plan={user.subscription_plan} />
      </div>
    </AppShell>
  );
}
