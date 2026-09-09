import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy route. The bot formerly called "Totalum" is now "The Headmaster",
 * so /totalum permanently redirects to the canonical /headmaster console.
 */
export default async function TotalumLegacyPage() {
  console.log("[totalum] Legacy route hit — redirecting to /headmaster");
  redirect("/headmaster");
}
