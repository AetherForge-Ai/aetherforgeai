import { redirect } from "next/navigation";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ChatAssistant } from "@/components/chat/ChatAssistant";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/chat");

  if (isStripeConfigured() && !hasActiveSubscription(user)) {
    redirect("/pricing");
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
