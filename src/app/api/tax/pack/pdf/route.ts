import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { canExportCsv } from "@/lib/entitlements";
import { dividendViewFromRow, summariseDividends } from "@/lib/dividend-ledger";
import { buildFifPaper, marketsFromNotes } from "@/lib/fif-working-paper";
import { aucklandCivilToday, inNzTaxYear, isNzTaxYearEnding, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { loadDividendRows, loadStockNoteRows, loadTaxRows } from "@/lib/tax-book-server";
import { dividendPaperLines, fifPaperLines, incomePaperLines, realisedPaperLines, taxPaperPdf } from "@/lib/tax-pack";
import { realisedByTaxYear } from "@/lib/tax-realised";
import { taxableIncome } from "@/lib/taxable-income";

export const dynamic = "force-dynamic";

const PAPERS = ["fif", "realised", "income", "dividends"] as const;
type PaperName = (typeof PAPERS)[number];

function isPaper(value: string | null): value is PaperName {
  return PAPERS.includes(value as PaperName);
}

/** GET /api/tax/pack/pdf?paper=fif&year=2027 — indicative PDF. Not an accountant sign-off. */
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }
    if (!canExportCsv(user.subscription_plan)) {
      return NextResponse.json(
        { ok: false, error: "CSV export is included on Starter and above.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }
    const url = new URL(req.url);
    const paper = url.searchParams.get("paper");
    if (!isPaper(paper)) {
      return NextResponse.json({ ok: false, error: "Working paper was not recognised." }, { status: 400 });
    }
    const requested = Number(url.searchParams.get("year"));
    const endingYear = isNzTaxYearEnding(requested) ? requested : nzTaxYearEnding(aucklandCivilToday());
    if (endingYear == null) {
      return NextResponse.json({ ok: false, error: "Tax year was not recognised." }, { status: 400 });
    }

    let title = "Working paper";
    let yearLabel = nzTaxYearLabel(endingYear);
    let lines: string[] = [];
    if (paper === "fif") {
      const [rows, stocks] = await Promise.all([loadTaxRows(user._id), loadStockNoteRows(user._id)]);
      const built = buildFifPaper({ rows, markets: marketsFromNotes(stocks, endingYear), endingYear });
      title = "FIF working paper";
      yearLabel = built.label;
      lines = fifPaperLines(built);
    } else if (paper === "realised") {
      const report = realisedByTaxYear(await loadTaxRows(user._id), endingYear);
      title = "Realised profit and loss";
      yearLabel = report.label;
      lines = realisedPaperLines(report);
    } else if (paper === "income") {
      const report = taxableIncome(await loadTaxRows(user._id), endingYear);
      title = "Income summary";
      yearLabel = report.label;
      lines = incomePaperLines(report);
    } else {
      const rows = (await loadDividendRows(user._id))
        .map(dividendViewFromRow)
        .filter((row) => inNzTaxYear(row.when, endingYear));
      title = "Dividend ledger";
      lines = dividendPaperLines(summariseDividends(rows));
    }

    const pdf = taxPaperPdf({ title, taxYear: yearLabel, lines });
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${paper}-${endingYear}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to build the tax PDF";
    console.error("[api/tax/pack/pdf] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
