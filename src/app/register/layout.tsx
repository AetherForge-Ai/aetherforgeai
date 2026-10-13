import { SiteHeader } from "@/components/SiteHeader";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/register", {
  title: "Create an account · AetherForge AI",
  description: "Create an AetherForge account for a paper book.",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="chrome-dark min-h-screen bg-background">
      <SiteHeader />
      <div className="content-light mx-auto my-8 max-w-lg rounded-2xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
