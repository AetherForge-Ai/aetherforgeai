import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { boardToComparison, buildSessionBoard, comparisonCsv } from "@/lib/daily-price-history";
import { loadReportPredictions, readDailyPriceHistory } from "@/lib/daily-price-history.server";

export const dynamic = "force-dynamic";

/** CSV of stored closes lined up with this member's report signals. Empty cells are gaps. */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const history = await readDailyPriceHistory();
  const predictions = user && !user.identityConflict ? await loadReportPredictions(user._id) : [];
  const board = buildSessionBoard({ now: new Date(), rows: history.ok ? history.rows : [] });
  const csv = comparisonCsv(boardToComparison(board, predictions));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="daily-prices.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
