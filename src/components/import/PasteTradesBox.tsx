"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { readCachedBook } from "@/lib/client-user-state";
import { useLiveSessionUser } from "@/lib/use-live-session";
import { withRowDates } from "@/lib/paste-date";
import {
  PASTE_COLUMN_MAP,
  PASTE_IMPORT_AI_ENABLED,
  parsePastedTrades,
  pastedRowNzd,
  pastedRowsToCsv,
  type PastedRow,
} from "@/lib/paste-import";

type Rates = Readonly<Record<string, number>>;

/** Tickers in the cached book, or null when the book is not known on this device. */
function heldTickersFromBook(userId: string | null | undefined): Set<string> | null {
  const book = readCachedBook(userId);
  if (!book) return null;
  return heldTickersFromRows(book.stocks as Array<Record<string, unknown>>);
}

/** b42 P3: tickers with a positive quantity, from the cached book or GET /api/stocks rows. */
export function heldTickersFromRows(rows: ReadonlyArray<Record<string, unknown>>): Set<string> {
  const out = new Set<string>();
  for (const s of rows) {
    const t = String(s?.ticker ?? s?.symbol ?? "").toUpperCase();
    const qty = Number(s?.shares ?? s?.quantity ?? 1);
    if (t && qty > 0) out.add(t);
  }
  return out;
}

const money = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("en-NZ", { maximumFractionDigits: 6 }));
const nzd = (n: number | null) => (n == null ? "—" : `NZ$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * b41 G-24: the review table for pasted trades. Every row shows date, side, ticker, quantity, price,
 * currency, fee and NZ$ total. A row with no date has a REQUIRED, blank date input (never today's
 * date, never a silent default); a sell of a ticker not in the book is marked "not held".
 */
export function PasteReviewTable({
  rows,
  rowDates,
  onRowDate,
  held,
  rates,
  idPrefix = "paste",
}: {
  rows: readonly PastedRow[];
  rowDates: Readonly<Record<number, string>>;
  onRowDate: (index: number, value: string) => void;
  held: ReadonlySet<string> | null;
  rates: Rates | null;
  idPrefix?: string;
}) {
  return (
    <div className="mt-2 overflow-x-auto" data-paste-review>
      <table className="w-full text-left text-sm" data-paste-row-dates>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 pr-2">Date</th>
            <th className="py-1 pr-2">Side</th>
            <th className="py-1 pr-2">Ticker</th>
            <th className="py-1 pr-2 text-right">Quantity</th>
            <th className="py-1 pr-2 text-right">Price</th>
            <th className="py-1 pr-2">Currency</th>
            <th className="py-1 pr-2 text-right">Fee</th>
            <th className="py-1 text-right">NZ$ total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const notHeld = r.type === "Sell" && held != null && !held.has(r.ticker);
            return (
              <tr key={i} className="border-t align-top" data-paste-row={i}>
                <td className="py-1 pr-2">
                  {r.date ? (
                    r.date
                  ) : (
                    <label className="flex flex-col gap-0.5" data-paste-date-missing>
                      <span className="text-xs font-medium text-rose-700">Date missing</span>
                      <input
                        id={`${idPrefix}-date-${i}`}
                        type="date"
                        required
                        aria-required="true"
                        aria-invalid={!rowDates[i]}
                        className="rounded border px-2 py-1"
                        value={rowDates[i] ?? ""}
                        onChange={(e) => onRowDate(i, e.target.value)}
                        aria-label={`Trade date for ${r.type} ${r.type === "Dividend" ? "" : `${r.quantity} `}${r.ticker}`}
                      />
                    </label>
                  )}
                </td>
                <td className="py-1 pr-2">{r.type}</td>
                <td className="py-1 pr-2">
                  {r.ticker}
                  {notHeld ? (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-medium text-amber-900" data-paste-not-held>
                      not held
                    </span>
                  ) : null}
                </td>
                <td className="py-1 pr-2 text-right">{r.type === "Dividend" ? "—" : money(r.quantity)}</td>
                <td className="py-1 pr-2 text-right">{money(r.price)}</td>
                <td className="py-1 pr-2">{r.currency ?? <span className="text-rose-700">?</span>}</td>
                <td className="py-1 pr-2 text-right">
                  {r.fees == null ? "—" : money(r.fees)}
                  {r.tax != null ? <span className="block text-xs text-muted-foreground">tax {money(r.tax)}</span> : null}
                </td>
                <td className="py-1 text-right">{nzd(pastedRowNzd(r, rates))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * b40/b41 G-24: a visible "Paste trades" box for /import and the dashboard Import CSV dialog. Pasted
 * email or contract-note text is read by the rules-based parser and shown in a review table. Rows
 * with no date must be given one before the trades go on. Cancel clears everything. The CSV goes to
 * the caller with its column map, so the column mapper is skipped; nothing is saved here.
 */
export function PasteTradesBox({
  onCsv,
  idPrefix = "paste",
  held: heldProp,
}: {
  onCsv: (csv: string, name: string, mapping: Readonly<Record<string, string>>) => void;
  idPrefix?: string;
  held?: ReadonlySet<string> | null;
}) {
  const { user } = useLiveSessionUser();
  const [pasted, setPasted] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<PastedRow[]>([]);
  const [rowDates, setRowDates] = useState<Record<number, string>>({});
  const [rates, setRates] = useState<Rates | null>(null);
  const bookHeld = useMemo(() => (heldProp !== undefined ? heldProp : heldTickersFromBook(user?.id)), [heldProp, user?.id]);
  // b42 P3: no cached book on this device: fetch the holdings, so a sell you don't hold is flagged here.
  const [fetchedHeld, setFetchedHeld] = useState<Set<string> | null>(null);
  const held = bookHeld ?? fetchedHeld;
  const needHoldings = bookHeld == null && fetchedHeld == null && Boolean(user?.id) && rows.some((r) => r.type === "Sell");
  useEffect(() => {
    if (!needHoldings) return;
    let live = true;
    api
      .get<Array<Record<string, unknown>>>("/api/stocks")
      .then((res) => {
        if (!live || !res.ok || !Array.isArray(res.data)) return;
        setFetchedHeld(heldTickersFromRows(res.data));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [needHoldings]);
  const missing = rows.filter((r, i) => !r.date && !rowDates[i]).length;

  useEffect(() => {
    if (!rows.some((r) => r.currency && r.currency !== "NZD") || rates) return;
    let live = true;
    api
      .get<{ ratesToNZD: Rates }>("/api/fx")
      .then((res) => {
        if (live && res.ok && res.data?.ratesToNZD) setRates(res.data.ratesToNZD);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [rows, rates]);

  function read() {
    const { rows: found, unread } = parsePastedTrades(pasted);
    setRowDates({});
    if (!found.length) {
      setRows([]);
      setNote("No trades found in that text. Paste lines like “Bought 25 FPH.NZ at NZ$28.50 on 13 Oct 2026”.");
      return;
    }
    const dateless = found.filter((r) => !r.date).length;
    setRows(found);
    setNote(
      `${found.length} row${found.length === 1 ? "" : "s"} read from the text${unread.length ? `; ${unread.length} part${unread.length === 1 ? "" : "s"} could not be read` : ""}. Review them below before anything is saved.${dateless ? ` Date missing on ${dateless} row${dateless === 1 ? "" : "s"}: set each date below.` : ""}`
    );
  }

  function cancel() {
    setPasted("");
    setRows([]);
    setRowDates({});
    setNote("");
  }

  function sendRows() {
    if (missing) return;
    onCsv(pastedRowsToCsv(withRowDates(rows, rowDates, "")), "Pasted text", PASTE_COLUMN_MAP);
    setNote(`${rows.length} row${rows.length === 1 ? "" : "s"} sent to the import review. Nothing is saved until you confirm there.`);
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
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={read} disabled={!pasted.trim()} className="h-9 rounded-md border px-3 text-sm font-semibold disabled:opacity-50">
          Read trades from text
        </button>
        {pasted || rows.length ? (
          <button type="button" onClick={cancel} className="h-9 rounded-md border px-3 text-sm" data-paste-cancel>
            Cancel
          </button>
        ) : null}
      </div>
      {note ? <p className="mt-2 text-sm" role="status">{note}</p> : null}
      {rows.length ? (
        <>
          <PasteReviewTable
            rows={rows}
            rowDates={rowDates}
            onRowDate={(i, v) => setRowDates((d) => ({ ...d, [i]: v }))}
            held={held}
            rates={rates}
            idPrefix={idPrefix}
          />
          {rows.some((r) => r.type === "Sell") && held == null ? (
            <p className="mt-1 text-xs text-muted-foreground">Checking your holdings… a sell of a ticker you do not hold is flagged here and on the next step.</p>
          ) : null}
          <button
            type="button"
            onClick={sendRows}
            disabled={missing > 0}
            className="mt-2 h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            data-paste-use
          >
            {missing ? `Set ${missing} missing date${missing === 1 ? "" : "s"} to continue` : "Review these trades"}
          </button>
        </>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {PASTE_IMPORT_AI_ENABLED
          ? "AI reading of PDFs and screenshots is switched on."
          : "AI reading is off: only pasted text is read, in the app, by fixed rules. PDFs and screenshots are not read."}
      </p>
    </section>
  );
}
