import { notFound } from "next/navigation";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { Fixture500Page } from "@/components/dashboard/Fixture500Page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Example data · 500 rows · AetherForge AI", robots: { index: false, follow: false } };

// Goal b20 SECURITY: same gate as /test-hooks.
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  return <Fixture500Page retryHref="/test-hooks/dashboard-500" />;
}
