import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/stripe/success", {
  title: "Payment received · AetherForge AI",
  description: "Your AetherForge payment was received.",
});

export default function StripeSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
