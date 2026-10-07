import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/stripe/demo", {
  title: "Payment demo · AetherForge AI",
  description: "A demonstration of the AetherForge payment step.",
});

export default function StripeDemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
