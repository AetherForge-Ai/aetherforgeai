import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/logout", {
  title: "Sign out · AetherForge AI",
  description: "Sign out of your AetherForge account.",
});

export default function LogoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
