import { PublicGuide } from "@/components/public/PublicGuide";
import { CHANGELOG_ENTRIES } from "@/lib/changelog-entries";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/changelog", {
  title: "Changelog — AetherForge AI",
  description: "Recent product changes on AetherForge AI, newest first.",
});

export default function ChangelogPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Changelog"
      title="Changelog"
      lede="These notes follow recent published changes. They are not a performance record and they are not a forecast. The same notes are available as RSS at /rss.xml."
      links={[...CHANGELOG_ENTRIES]}
    />
  );
}
