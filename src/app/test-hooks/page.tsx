import TestHooksPanel from "@/components/TestHooksPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test-mode hooks · AetherForge AI", robots: { index: false, follow: false } };

export default function Page() {
  return <TestHooksPanel enabled={process.env.GOAL_TEST_HOOKS !== "0"} />;
}
