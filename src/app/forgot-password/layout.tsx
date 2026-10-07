import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/forgot-password", {
  title: "Reset your password · AetherForge AI",
  description: "Send a password reset for your AetherForge account.",
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
