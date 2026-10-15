import { SiteHeader } from "@/components/SiteHeader";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/reset-password", {
  title: "Choose a new password · AetherForge AI",
  description: "Choose a new password for your AetherForge account.",
});

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      {children}
    </div>
  );
}
