import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/status", {
  title: "Status — AetherForge AI",
  description: "Status updates for AetherForge AI are posted on this page.",
});

export default function StatusPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Status"
      title="Status"
      lede="Status updates are posted here."
      links={[
        {
          href: "/trust",
          title: "Data sources",
          body: "The Trust page lists where prices come from. This page does not report uptime.",
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
