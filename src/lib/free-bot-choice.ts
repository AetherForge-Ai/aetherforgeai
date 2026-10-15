/**
 * Free plan: one of Stox or Koins (see /pricing). Once a Free member has chosen a bot,
 * choosing the other one is refused on the server. Legacy "both" accounts keep both.
 */
export type FreeBotChoice = "stock" | "crypto";

export type FreeBotDecision =
  | { ok: true; botAccess: "stock" | "crypto" | "both" }
  | { ok: false; status: 403; error: string };

export function decideFreeBotChoice(
  user: { subscription_status?: string | null; subscription_plan?: string | null; bot_access?: string | null },
  chosen: FreeBotChoice
): FreeBotDecision {
  const current = String(user.bot_access || "none");
  if (current === "both") return { ok: true, botAccess: "both" };
  const onFree = user.subscription_status === "active" && String(user.subscription_plan || "") === "free";
  if (onFree && (current === "stock" || current === "crypto") && current !== chosen) {
    const have = current === "crypto" ? "Koins" : "Stox";
    return {
      ok: false,
      status: 403,
      error: `The Free plan includes one bot. ${have} is your free bot. Upgrade to Pro to use both Stox and Koins.`,
    };
  }
  return { ok: true, botAccess: chosen };
}

/** Settings card line for a Free member. No purchase or expiry date is shown for Free. */
export function freePlanLine(botAccess?: string | null): string {
  const bot = botAccess === "crypto" ? "Koins" : botAccess === "stock" ? "Stox" : botAccess === "both" ? "Stox and Koins" : null;
  return bot ? `Free plan · ${bot} · 3 reports a month · up to 10 holdings` : "Free plan · choose Stox or Koins on the dashboard";
}
