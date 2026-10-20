import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { COMPARISONS, GUIDES } from "@/data/learn-content";

export const metadata = publicPageMetadata("/learn", {
  title: "Learn: NZ investing guides — AetherForge AI",
  description: "Short NZ investing guides on FIF, dividends, imputation, PIR and KiwiSaver. Every fact links to its source with the date it was checked.",
});

export default function LearnPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Learn"
      title="NZ investing guides"
      lede="Short guides on NZ tax and saving rules. Every fact links to the page it came from and the date we checked it. General information only. Indicative, not tax advice."
      links={[
        ...GUIDES.map((g) => ({ href: `/learn/${g.slug}`, title: g.title, body: g.description })),
        ...COMPARISONS.map((c) => ({ href: `/compare/${c.slug}`, title: `AetherForge AI vs ${c.name}`, body: c.description })),
      ]}
    />
  );
}
