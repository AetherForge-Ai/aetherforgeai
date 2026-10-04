import type { Metadata } from "next";
import { AboutContent } from "@/components/about/AboutContent";

export const metadata: Metadata = {
  title: "About AetherForge AI — Built in New Zealand, for New Zealanders",
  description:
    "AetherForge AI, by FORGE INTELLIGENCE LIMITED. Paper-portfolio intelligence across NZX, ASX, US equities, crypto and precious metals. Not a broker. Founder: Lukas Southey.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About AetherForge AI — Built in New Zealand, for New Zealanders",
    description:
      "Paper-portfolio intelligence for NZX, ASX, US markets, crypto and metals. Not a broker. Founder: Lukas Southey.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
