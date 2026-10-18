"use client";

import { useState } from "react";
import { nzToday, withRowDates } from "@/lib/paste-date";
import { PASTE_IMPORT_AI_ENABLED, parsePastedTrades, pastedRowsToCsv, type PastedRow } from "@/lib/paste-import";

/**
 * b40 G-24: a visible "Paste trades" box for /import and the dashboard Import CSV dialog. Pasted email
 * or contract-note text is read by the existing rules-based parser. A row with no date shows
 * "Date missing" with its own date input (default today, NZ). The result goes to the caller as CSV
 * for the same review screen; nothing is saved here.
 */
export function PasteTradesBox({ onCsv, idPrefix = "paste" }: { onCsv: (csv: string, name: string) => void; idPrefix?: string }) {
  const [pasted, setPasted] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<PastedRow[]>([]);
  const [missingDate, setMissingDate] = useState("");
  const [rowDates, setRowDates] = useState<Record<number, string>>({});

  function emit(nextRows: PastedRow[], dates: Record<number, string>, fill: string) {
    onCsv(pastedRowsToCsv(withRowDates(nextRows, dates, fill)), "Pasted text");
  }

  function read() {
    const { rows: found, unread } = parsePastedTrades(pasted);
    if (!found.length) {
      setRows([]);
      setNote("No trades found in that text. Paste lines like “Bought 25 FPH.NZ at NZ$28.50 on 13 Oct 2026”.");
      return;
    }
    const dateless = found.filter((r) => !r.date).length;
    const fill = missingDate || nzToday();
    if (dateless && !missingDate) setMissingDate(fill);
    setRows(found);
    setRowDates({});
    setNote(
      `${found.length} trade${found.length === 1 ? "" : "s"} read from the text${unread.length ? `; ${unread.length} part${unread.length === 1 ? "" : "s"} could not be read` : ""}. Review them below before anything is saved.${dateless ? ` Date missing on ${dateless} trade${dateless === 1 ? "" : "s"}: set each date below.` : ""}`
    );
    emit(found, {}, fill);
  }

  return (
    <section className="mt-4 rounded-md border p-3" data-paste-trades aria-labelledby={`${idPrefix}-title`}>
      <h2 id={`${idPrefix}-title`} className="text-sm font-semibold">Paste trades</h2>
      <p className="mt-1 text-xs text-muted-foreground">Paste confirmation emails or contract-note text. Each trade is shown for review before anything is saved.</p>
      <textarea
        id={`${idPrefix}-text`}
        aria-label="Paste trades"
        className="mt-2 h-32 w-full rounded-md border bg-background p-2 text-sm"
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Bought 25 FPH.NZ at NZ$28.50 on 13 Oct 2026. Brokerage: $5.00"
      />
      <button type="button" onClick={read} disabled={!pasted.trim()} className="mt-2 h-9 rounded-md border px-3 text-sm font-semibold disabled:opacity-50">
        Read trades from text
      </button>
      {note ? <p className="mt-2 text-sm" role="status">{note}</p> : null}
      {rows.some((r) => !r.date) ? (
        <div className="mt-2 space-y-1 text-sm" data-paste-date-missing>
          <label className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-rose-700">Date missing</span>
            <input
              type="date"
              className="rounded border px-2 py-1"
              value={missingDate}
              onChange={(e) => {
                setMissingDate(e.target.value);
                emit(rows, rowDates, e.target.value);
              }}
              aria-label="Trade date for all rows with no date"
            />
            <span className="text-xs text-muted-foreground">(all rows below unless set per row)</span>
          </label>
          <ul className="space-y-1" data-paste-row-dates>
            {rows.map((r, i) =>
              r.date ? null : (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <span>
                    {r.type} {r.quantity} {r.ticker} @ {r.price}
                  </span>
                  <input
                    type="date"
                    className="rounded border px-2 py-1"
                    value={rowDates[i] || missingDate}
                    onChange={(e) => {
                      const next = { ...rowDates, [i]: e.target.value };
                      setRowDates(next);
                      emit(rows, next, missingDate);
                    }}
                    aria-label={`Trade date for ${r.type} ${r.quantity} ${r.ticker}`}
                  />
                </li>
              )
            )}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {PASTE_IMPORT_AI_ENABLED
          ? "AI reading of PDFs and screenshots is switched on."
          : "AI reading is off: only pasted text is read, in the app, by fixed rules. PDFs and screenshots are not read."}
      </p>
    </section>
  );
}
