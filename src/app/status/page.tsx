import type { Metadata } from "next";
import { snapshotMetaOther } from "@/lib/crypto-snapshot";
import { headers } from "next/headers";
import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { loadStatusFeeds } from "@/lib/status-feeds.server";
import { applyFeedForce, readFeedForce } from "@/lib/feed-freshness-hook";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { statusFeedBody } from "@/lib/status-feeds";
import { NO_INCIDENTS_LINE, STATUS_INCIDENTS } from "@/lib/docs-guides";
import { formatDisplayDateTime } from "@/lib/currency";
import { aiProviderHealth, aiProviderStatusLine } from "@/lib/ai-provider-health";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const meta = publicPageMetadata("/status", {
    title: "Status — AetherForge AI",
    description: "Status updates for AetherForge AI are posted on this page.",
  });
  // b31 H-1: the shared snapshot stamp on every server-rendered page that shows prices.
  return { ...meta, other: { ...(meta.other ?? {}), ...(await snapshotMetaOther()) } };
}

export default async function StatusPage() {
  const [rawFeeds, ai, allowed, headerList] = await Promise.all([
    loadStatusFeeds(),
    aiProviderHealth(),
    currentUserMayUseTestHooks(),
    headers(),
  ]);
  // G-05: the cookie only changes a cell for an allow-listed test account.
  const feeds = applyFeedForce(rawFeeds, readFeedForce(headerList.get("cookie"), allowed));
  const aiLine = aiProviderStatusLine(ai);
  return (
    <PublicGuide
      kicker="AetherForge AI · Status"
      title="Status"
      lede="The times below are the latest provider timestamps this page could read. This page does not report uptime."
      notes={[
        ...feeds.map((feed) => ({
          title: feed.label,
          body: statusFeedBody(feed),
          tone: feed.tone,
        })),
        { title: "AI guide provider", body: aiLine.body, tone: aiLine.tone },
        STATUS_INCIDENTS.length
          ? {
              title: "Incident history",
              body: STATUS_INCIDENTS.map(
                (i) => `${formatDisplayDateTime(i.startedAt)} to ${i.resolvedAt ? formatDisplayDateTime(i.resolvedAt) : "ongoing"}: ${i.title}. ${i.detail}`
              ).join(" "),
            }
          : { title: "Incident history", body: NO_INCIDENTS_LINE },
      ]}
      links={[
        {
          href: "/trust",
          title: "Data sources",
          body: "The Trust page lists where prices come from. A missing time is shown as unavailable. No time is invented.",
        },
        {
          href: "/changelog",
          title: "Changelog",
          body: "Product changes are listed on the changelog as dated notes.",
        },
      ]}
    />
  );
}
