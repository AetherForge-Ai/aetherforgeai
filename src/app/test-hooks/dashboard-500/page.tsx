import { notFound } from "next/navigation";
import Fixture500Client from "@/components/dashboard/Fixture500Client";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Example data · 500 rows · AetherForge AI", robots: { index: false, follow: false } };

// Goal b20 SECURITY: same gate as /test-hooks.
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  return <Fixture500Client />;
}
