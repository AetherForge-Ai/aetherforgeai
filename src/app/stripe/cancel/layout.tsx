import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/stripe/cancel", {
  title: "Payment cancelled · AetherForge AI",
  description: "The AetherForge payment was cancelled.",
});

export default function StripeCancelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
