import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/verify-email", {
  title: "Verify your email · AetherForge AI",
  description: "Confirm the email address on your AetherForge account.",
});

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
