import { AboutContent } from "@/components/about/AboutContent";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/about", {
  title: "About AetherForge AI — Built in New Zealand, for New Zealanders",
  description:
    "AetherForge AI, by FORGE INTELLIGENCE LIMITED. Paper-portfolio intelligence across NZX, ASX, US equities, crypto and precious metals. Not a broker. Founder: Lukas Southey.",
});

export default function AboutPage() {
  return <AboutContent />;
}
