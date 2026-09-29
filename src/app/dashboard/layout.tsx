import { connection } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * Opt the whole dashboard segment out of the Full Route / Data cache.
 * `connection()` marks the render dynamic without reading the cookie jar,
 * so a worker isolate cannot reuse the previous member's session.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
