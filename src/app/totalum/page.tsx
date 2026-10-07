import { redirect } from "next/navigation";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/totalum", {
  title: "Legacy Headmaster address · AetherForge AI",
  description: "This address now opens The Headmaster.",
});

/**
 * Legacy route. The bot formerly called "Totalum" is now "The Headmaster",
 * so /totalum permanently redirects to the canonical /headmaster console.
 */
export default async function TotalumLegacyPage() {
  console.log("[totalum] Legacy route hit — redirecting to /headmaster");
  redirect("/headmaster");
}
