import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { AppShell } from "@/components/AppShell";
import { ChatAssistant } from "@/components/chat/ChatAssistant";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/chat", {
  title: "Market Assistant · AetherForge AI",
  description: "Ask the AetherForge assistant about the holdings on your paper book.",
});

/**
 * Market Assistant. Free includes a monthly query cap (see entitlements).
 * This route used to clone the dashboard and redirect anyone without an
 * active subscription to /pricing, which locked the assistant pricing promises.
 */
export default async function MarketAssistantPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to use the Market Assistant" }}>
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold">Market Assistant</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Free accounts include 20 informational queries a month. Answers are scenarios, not
            personalised advice. AetherForge does not trade for you.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/register">Start free</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

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
      <ChatAssistant />
    </AppShell>
  );
}
