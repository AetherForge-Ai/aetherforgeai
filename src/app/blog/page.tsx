import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/blog", {
  title: "Blog — AetherForge AI",
  description:
    "AetherForge AI does not publish a blog yet. Market headlines are on Market News. Example paper-portfolio snapshots are on Live Results.",
});

export default function BlogPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Blog"
      title="Blog"
      lede="There are no articles here yet. Market headlines and example paper-portfolio snapshots already live on the pages below. Those snapshots are illustrative. They are not a promise of future returns."
      links={[
        {
          href: "/market-news",
          title: "Market News",
          body: "Headlines already collected for the markets AetherForge follows.",
        },
        {
          href: "/performance",
          title: "Live Results",
          body: "Timestamped screenshots of one paper portfolio. Illustrative only — not a broker, and not a forecast.",
        },
        {
          href: "/docs",
          title: "Docs",
          body: "How the product works, the AI disclaimer, and the policies that apply.",
        },
        {
          href: "/about",
          title: "About",
          body: "Who builds AetherForge AI, and how to get in touch.",
        },
      ]}
    />
  );
}
