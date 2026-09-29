import type { Metadata } from "next";
import { AboutContent } from "@/components/about/AboutContent";

export const metadata: Metadata = {
  title: "About AetherForge AI — Built in New Zealand, for New Zealanders",
  description:
    "AetherForge AI, by Forge Intelligence Limited, is 100% New Zealand owned & operated. Paper-portfolio intelligence across NZX, ASX, US equities, crypto and precious metals. Not a broker. Meet the founder and our story.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About AetherForge AI — Built in New Zealand, for New Zealanders",
    description:
      "100% NZ owned & operated paper-portfolio intelligence for NZX, ASX, US markets, crypto and metals. Not a broker. Meet the founder and our story.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
