import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { loadStatusFeeds } from "@/lib/status-feeds.server";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/status", {
  title: "Status — AetherForge AI",
  description: "Status updates for AetherForge AI are posted on this page.",
});

export default async function StatusPage() {
  const feeds = await loadStatusFeeds();
  return (
    <PublicGuide
      kicker="AetherForge AI · Status"
      title="Status"
      lede="The times below are the latest provider timestamps this page could read. This page does not report uptime."
      notes={feeds.map((feed) => ({
        title: feed.label,
        body: feed.tone === "amber" ? "unavailable" : feed.text,
        tone: feed.tone,
      }))}
      links={[
        {
          href: "/trust",
          title: "Data sources",
          body: "The Trust page lists where prices come from. A missing time is shown as unavailable. No time is invented.",
        },
        {
          href: "/changelog",
          title: "Changelog",
          body: "Product changes are listed on the changelog, from the develop history.",
        },
      ]}
    />
  );
}
