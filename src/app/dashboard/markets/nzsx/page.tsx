import { headers } from "next/headers";
import { AppShell } from "@/components/AppShell";
import { NzsxMarketPage } from "@/components/markets/NzsxMarketPage";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/dashboard/markets/nzsx", {
  title: "NZSX Markets · AetherForge AI",
  description: "S&P/NZX 50 level, breadth and top movers beside your AetherForge paper book.",
});

export default async function Page() {
  const headerList = await headers();
  const guestDocument = headerList.get("x-af-doc") !== "member";
  return (
    <AppShell>
      <NzsxMarketPage guestDocument={guestDocument} />
    </AppShell>
  );
}
