import type { Metadata } from "next";
import { AboutContent } from "@/components/about/AboutContent";

export const metadata: Metadata = {
  title: "About AetherForge AI — Built in New Zealand, for New Zealanders",
  description:
    "AetherForge AI, by Forge Intelligence Limited, is 100% New Zealand owned & operated. Powerful AI market intelligence for the NZX & ASX that keeps you in complete control of every trading decision. Meet the founder and our story.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About AetherForge AI — Built in New Zealand, for New Zealanders",
    description:
      "100% NZ owned & operated AI market intelligence for the NZX & ASX. We don't trade for you — we empower you. Meet the founder and our story.",
    url: "/about",
    type: "website",
  },
};

export default function AboutPage() {
  return <AboutContent />;
}
