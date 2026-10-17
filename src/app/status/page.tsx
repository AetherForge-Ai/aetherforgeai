import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { loadStatusFeeds } from "@/lib/status-feeds.server";
import { NO_INCIDENTS_LINE, STATUS_INCIDENTS } from "@/lib/docs-guides";
import { formatDisplayDateTime } from "@/lib/currency";
import { aiProviderHealth, aiProviderStatusLine } from "@/lib/ai-provider-health";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/status", {
  title: "Status — AetherForge AI",
  description: "Status updates for AetherForge AI are posted on this page.",
});

export default async function StatusPage() {
  const [feeds, ai] = await Promise.all([loadStatusFeeds(), aiProviderHealth()]);
  const aiLine = aiProviderStatusLine(ai);
  return (
    <PublicGuide
      kicker="AetherForge AI · Status"
      title="Status"
      lede="The times below are the latest provider timestamps this page could read. This page does not report uptime."
      notes={[
        ...feeds.map((feed) => ({
          title: feed.label,
          body: feed.tone === "amber" ? "unavailable" : `Last OK ${feed.text} (NZ time)`,
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
