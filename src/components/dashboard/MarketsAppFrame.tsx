import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

type FrameUser = {
  name: string;
  email: string;
  image?: string | null;
  subscription_status?: string | null;
  subscription_plan?: string | null;
} | null;

/** Same shell as /markets so detail pages keep the Stock Markets nav. */
export function MarketsAppFrame({ user, children }: { user: FrameUser; children: ReactNode }) {
  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        {children}
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
      {children}
    </AppShell>
  );
}
