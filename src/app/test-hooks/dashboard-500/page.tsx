import Fixture500Client from "@/components/dashboard/Fixture500Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Example data · 500 rows · AetherForge AI", robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.GOAL_TEST_HOOKS === "0") return <main className="mx-auto max-w-xl p-6"><h1 className="text-xl font-semibold">Test-mode hooks are off</h1></main>;
  return <Fixture500Client />;
}
