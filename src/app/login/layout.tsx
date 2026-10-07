import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/login", {
  title: "Sign in · AetherForge AI",
  description: "Sign in to your AetherForge paper book.",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
