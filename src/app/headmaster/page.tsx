import { BotGuide } from "@/components/public/BotGuide";
import { getCurrentUser, isStripeConfigured } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { headmasterDepth } from "@/lib/entitlements";
import { BOT_GUIDES } from "@/lib/bot-guides";
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
  if (!user) {
    return (
      <BotGuide
        title="The Headmaster"
        lede="The Headmaster is the planning bot for the paper book."
        body={BOT_GUIDES.headmaster}
        kind="headmaster"
        screenshots={[{ src: "/screens/demo-book.png", alt: "Screenshot of the read-only example book with synthetic shares, crypto, metal and cash", caption: "Example book. Synthetic rows only.", width: 1200, height: 910 }, { src: "/screens/headmaster-example.png", alt: "Screenshot of the Headmaster example section showing a synthetic book split across a share, a coin and cash, with the example overview", caption: "Example Headmaster overview. Not a member result.", width: 752, height: 363 }]}
        images={[
          { src: "/brand/bot-headmaster-fullbody.webp", alt: "Illustration of the Headmaster character" },
        ]}
      />
    );
  }

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
