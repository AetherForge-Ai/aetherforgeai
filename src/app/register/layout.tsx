import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/register", {
  title: "Create an account · AetherForge AI",
  description: "Create an AetherForge account for a paper book.",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
