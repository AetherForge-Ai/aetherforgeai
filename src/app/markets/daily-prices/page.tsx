import { MARKETS_SSR_DEADLINE_MS, withDeadline } from "@/lib/ticker-serve";
import { MarketsAccountPending } from "@/components/markets/MarketsAccountPending";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser, type AppUser } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { marketLabel } from "@/lib/daily-price-directory";
import {
  HISTORY_UNAVAILABLE,
  boardToComparison,
  buildSessionBoard,
  type ComparisonLine,
  type SessionBoardRow,
} from "@/lib/daily-price-history";
import { loadReportPredictions, readDailyPriceHistory } from "@/lib/daily-price-history.server";
import { canReadTwelveData } from "@/lib/daily-price-twelve";
import { EXCHANGES, type Exchange } from "@/lib/market-intel";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = publicPageMetadata("/markets/daily-prices", {
  title: "Daily prices · AetherForge AI",
  description: "Stored session closes for the NZX 50, ASX 200, Dow Jones and Nasdaq, lined up with report signals. A gap is a session that was not stored.",
});

const SESSION_PENDING = "session-pending" as const;

function cell(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "gap";
  return value.toLocaleString("en-NZ", { maximumFractionDigits: 4 });
}

function shellUser(user: AppUser | null) {
  if (!user) return { guest: true as const, user: { name: "Guest", email: "Sign in to activate your account" } };
  return {
    guest: false as const,
    user: {
      name: user.name,
      email: user.email,
      image: user.image,
      subscription_status: user.subscription_status,
      subscription_plan: user.subscription_plan,
    },
  };
}

export default async function DailyPricesPage() {
  const user = await withDeadline<AppUser | null | typeof SESSION_PENDING>(getCurrentUser(), MARKETS_SSR_DEADLINE_MS, SESSION_PENDING);
  if (user === SESSION_PENDING) return <MarketsAccountPending />;
  const feedReady = canReadTwelveData();
  const history = feedReady ? await readDailyPriceHistory() : { ok: false as const, reason: HISTORY_UNAVAILABLE };
  const predictions = user && !user.identityConflict ? await loadReportPredictions(user._id) : [];
  const now = new Date();
  const board = buildSessionBoard({ now, rows: history.ok ? history.rows : [] });
  const comparison = boardToComparison(board, predictions);
  const account = shellUser(user);

  return (
    <AppShell tone="dark" guest={account.guest} user={account.user}>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm">
          <a href="/markets" className="font-semibold text-primary underline-offset-2 hover:underline">
            Markets
          </a>
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold">Daily prices</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Latest stored session close and change for the NZX 50, ASX 200, Dow Jones and Nasdaq, and the constituent
          lists already used on AetherForge. A gap means that close was not stored.
        </p>
        {!history.ok ? (
          <p className="mt-4 rounded-2xl border border-border/70 bg-card/50 px-4 py-3 text-sm" role="status">
            {HISTORY_UNAVAILABLE}
          </p>
        ) : null}
        <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
          Stored closes are Twelve Data daily bars. A gap is a session Twelve Data did not return. Yahoo Finance is not used here.
        </p>
        <p className="mt-4 text-sm">
          <a href="/markets/daily-prices/export" className="font-semibold text-primary underline-offset-2 hover:underline">
            Download CSV
          </a>
          {user ? null : <span className="text-muted-foreground"> · Sign in to include your report signals in the file.</span>}
        </p>

        {EXCHANGES.map((market) => (
          <MarketTable key={market} market={market} rows={board.filter((row) => row.market === market)} />
        ))}

        <h2 className="mt-10 font-display text-xl font-semibold">Signals for the same date</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Labels and predicted prices are the saved report picks the Market Assistant already uses. They are lined up
          with a stored close only when the date and symbol match. A predicted price is never shown as the close.
        </p>
        {user ? null : (
          <p className="mt-3 text-sm text-muted-foreground">Sign in to compare your AI chat and report signals.</p>
        )}
        <ComparisonTable lines={comparison.filter((line) => line.close != null || line.predictedPrice != null)} />
      </div>
    </AppShell>
  );
}

function MarketTable({ market, rows }: { market: Exchange; rows: SessionBoardRow[] }) {
  const session = rows[0]?.date;
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">{marketLabel(market)}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{session ? `Session ${session}` : "Session date unavailable"}</p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">{marketLabel(market)} session closes</caption>
          <thead className="bg-card/60 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Symbol</th>
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Close</th>
              <th scope="col" className="px-3 py-2 font-medium">Change</th>
              <th scope="col" className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.role}-${row.symbol}`} className="border-t border-border/60">
                <th scope="row" className="px-3 py-2 font-medium">{row.symbol}</th>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{cell(row.close)}</td>
                <td className="px-3 py-2">{cell(row.change)}</td>
                <td className="px-3 py-2">{row.source ?? "gap"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonTable({ lines }: { lines: ComparisonLine[] }) {
  if (!lines.length) {
    return <p className="mt-3 text-sm text-muted-foreground">No stored close is lined up with a signal yet.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <caption className="sr-only">Stored closes and report signals</caption>
        <thead className="bg-card/60 text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Date</th>
            <th scope="col" className="px-3 py-2 font-medium">Symbol</th>
            <th scope="col" className="px-3 py-2 font-medium">Close</th>
            <th scope="col" className="px-3 py-2 font-medium">Change</th>
            <th scope="col" className="px-3 py-2 font-medium">Label</th>
            <th scope="col" className="px-3 py-2 font-medium">Predicted price</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={`${line.date}-${line.symbol}`} className="border-t border-border/60">
              <td className="px-3 py-2">{line.date}</td>
              <th scope="row" className="px-3 py-2 font-medium">{line.symbol}</th>
              <td className="px-3 py-2">{cell(line.close)}</td>
              <td className="px-3 py-2">{cell(line.change)}</td>
              <td className="px-3 py-2">{line.label ?? "gap"}</td>
              <td className="px-3 py-2">{cell(line.predictedPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
