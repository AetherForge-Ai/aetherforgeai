import { AppShell } from "@/components/AppShell";
import { DividendLedgerView } from "@/components/tax/DividendLedgerView";
import { dividendViewFromRow } from "@/lib/dividend-ledger";
import { canExportCsv } from "@/lib/entitlements";
import { aucklandCivilToday, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { loadDividendRows, loadOpenHoldings } from "@/lib/tax-book-server";

export const dynamic = "force-dynamic";

export const metadata = {
  ...publicPageMetadata("/tax/dividends", {
    title: "Dividend ledger · AetherForge AI",
    description: "Indicative dividend ledger for a paper book. Not tax advice.",
  }),
  // Member books can sit on this URL. Keep it reachable and leave it out of the index.
  robots: { index: false, follow: false },
};

export default async function DividendLedgerPage() {
  const user = await getCurrentUser();
  const shellUser = user
    ? {
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }
    : { name: "Guest", email: "Sign in to activate your account" };

  let rows: ReturnType<typeof dividendViewFromRow>[] = [];
  let holdings: Awaited<ReturnType<typeof loadOpenHoldings>> = [];
  let readError = false;
  if (user) {
    try {
      const [dividendRows, openHoldings] = await Promise.all([
        loadDividendRows(user._id),
        loadOpenHoldings(user._id),
      ]);
      rows = dividendRows.map(dividendViewFromRow);
      holdings = openHoldings;
    } catch {
      readError = true;
    }
  }

  return (
    <AppShell user={shellUser} guest={!user}>
      <DividendLedgerView
        signedIn={!!user}
        holdings={holdings}
        rows={rows}
        readError={readError}
        csvAllowed={!!user && canExportCsv(user.subscription_plan)}
        taxYear={nzTaxYearEnding(aucklandCivilToday()) ?? new Date().getFullYear()}
      />
    </AppShell>
  );
}
