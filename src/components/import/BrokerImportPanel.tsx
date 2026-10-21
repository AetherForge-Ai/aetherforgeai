"use client";

import { workbookToCsv } from "@/lib/import/xlsx";
import { importFileProblem } from "@/lib/import-limits";
import { useEffect, useRef, useState } from "react";
import { importOversells } from "@/lib/import-oversell";
import { datelessCsvRows, withRowDates } from "@/lib/paste-date";
import { PASTE_COLUMN_MAP, PASTE_IMPORT_AI_ENABLED, parsePastedTrades, pastedRowsToCsv, type PastedRow } from "@/lib/paste-import";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { FUNDING_DISCLOSURE, readImportPreview, suggestedColumnMap, type ImportPlan, type ImportTrade } from "@/lib/broker-import";
import { readSavedColumnMap, writeSavedColumnMap } from "@/lib/import-commit";
import { HOLDINGS_IMPORT_DRAFT_KEY } from "@/lib/holdings-csv";
import { formatDisplayDate, formatDisplayDateTime, formatFxInput, formatNzd, formatUnitPrice } from "@/lib/currency";

const IMPORT_WAIT_MS = 30_000;
const IMPORT_TIMEOUT =
  "The import did not answer in time. It may still be saving. Refresh the book before you try again.";

type Preview = {
  broker: ImportPlan["broker"];
  error: string | null;
  headers: string[];
  needsMapping: boolean;
  unreadable?: boolean;
  unsupported: ImportPlan["unsupported"];
  duplicateCount: number;
  toWrite: ImportTrade[];
  fundingDeposits: ImportPlan["fundingDeposits"];
  fundingNeeded: boolean;
  sourceTotals: Record<string, number>;
  importedTotals: Record<string, number>;
  totalsMessage: string;
  written?: number;
  batchId?: string;
  summary?: string;
  fifoNote?: string | null;
  detection?: ImportPlan["detection"];
  flagged?: ImportTrade[];
};

const MAP_FIELDS = [
  ["date", "Date"],
  ["ticker", "Ticker"],
  ["side", "Type"],
  ["quantity", "Quantity"],
  ["price", "Price"],
  ["fee", "Fee"],
  ["currency", "Currency"],
  ["fx", "FX"],
  ["value", "Value"],
] as const;

export function BrokerImportPanel({
  initialText,
  initialFileName,
  embedded,
  onImported,
  initialMapping,
}: {
  /** b41 G-24: the pasted CSV's own column map, so the mapper is skipped. */
  initialMapping?: Record<string, string>;
  initialText?: string;
  initialFileName?: string;
  embedded?: boolean;
  onImported?: () => void;
} = {}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasted, setPasted] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  // b35 G-24 (GOAL-LOCK #59): a pasted line with no date is shown as "date missing" with an
  // editable date (default today, NZ), never dropped as "No trades found".
  const [pastedRows, setPastedRows] = useState<PastedRow[]>([]);
  const [missingDate, setMissingDate] = useState("");
  // b38 G-24: each dateless row can take its own date (falls back to the shared one).
  const [rowDates, setRowDates] = useState<Record<number, string>>({});
  const [mapping, setMapping] = useState<Record<string, string>>(() => ({ ...(initialMapping ?? {}) }));
  const [preview, setPreview] = useState<Preview | null>(null);
  // BS-02: brokers with no fixed header (InvestNow) are picked here and always use the column map.
  const [brokerPick, setBrokerPick] = useState<"" | "investnow">("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [acknowledgeSkipped, setAcknowledgeSkipped] = useState(false);
  const [fundBuys, setFundBuys] = useState(false);
  const [importError, setImportError] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [tickerFixes, setTickerFixes] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ written: number; batchId: string; summary: string } | null>(null);
  const pendingDraft = useRef<string | null>(null);
  // Goal b20 G-24: what the member holds now, for the review's oversell check.
  const [heldShares, setHeldShares] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!preview || preview.needsMapping) return;
    let live = true;
    fetch("/api/stocks", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Array<{ ticker?: string; shares?: number }> } | null) => {
        if (!live || !j || !Array.isArray(j.data)) return;
        const held: Record<string, number> = {};
        for (const row of j.data) {
          const t = String(row.ticker || "").toUpperCase();
          if (t) held[t] = (held[t] || 0) + (Number(row.shares) || 0);
        }
        setHeldShares(held);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [preview]);
  const oversells =
    preview && !preview.needsMapping && heldShares
      ? importOversells(
          preview.toWrite.map((r) => ({ line: r.line, ticker: r.ticker, side: String(r.side), quantity: Number(r.quantity), date: r.date, executedAt: r.executedAt ?? null })),
          heldShares
        )
      : {};
  const oversellCount = Object.keys(oversells).length;

  useEffect(() => {
    if (initialText) {
      pendingDraft.current = initialText;
      setText(initialText);
      setFileName(initialFileName || "import.csv");
      return;
    }
    const draft = sessionStorage.getItem(HOLDINGS_IMPORT_DRAFT_KEY);
    if (!draft) return;
    sessionStorage.removeItem(HOLDINGS_IMPORT_DRAFT_KEY);
    pendingDraft.current = draft;
    setText(draft);
    setFileName("holdings.csv");
  }, [initialText, initialFileName]);

  useEffect(() => {
    if (!pendingDraft.current || text !== pendingDraft.current) return;
    pendingDraft.current = null;
    void run(false);
  }, [text]);

  async function readFile(file: File) {
    const problem = importFileProblem(file);
    if (problem) {
      setImportError(problem);
      setFileKey((k) => k + 1);
      return;
    }
    // BS-02: an .xlsx (e.g. InvestNow General Ledger Report) is turned into CSV text in the browser,
    // values only, then goes through the same preview and column map as a CSV.
    const body = /\.xlsx$/i.test(file.name) ? await workbookToCsv(await file.arrayBuffer()) : await file.text();
    // b38 G-24: a file of trades with no date column (or raw dateless lines) goes to the
    // per-row date prompt instead of being rejected whole or silently ignored.
    const firstLine = body.split(/\r?\n/, 1)[0] || "";
    const dateless = datelessCsvRows(body) ?? (firstLine.includes(",") ? null : parsePastedTrades(body).rows.filter((r) => !r.date));
    if (dateless && dateless.length) {
      adoptPasted(dateless, [], file.name);
      return;
    }
    setText(body);
    setFileName(file.name);
    setPreview(null);
    setMessage("");
    setImportError("");
    setConsent(false);
    setAcknowledgeSkipped(false);
  }

  // Goal b19 G-24: pasted email or contract-note text becomes CSV for the same
  // review screen below. Nothing is saved until the member confirms there.
  const pastedDatesMissing = pastedRows.filter((r, i) => !r.date && !(rowDates[i] || missingDate)).length;

  function readPasted() {
    const { rows, unread } = parsePastedTrades(pasted);
    if (!rows.length) {
      setPasteNote("No trades found in that text. Paste lines like “Bought 25 FPH.NZ at NZ$28.50 on 13 Oct 2026”.");
      return;
    }
    adoptPasted(rows, unread, "Pasted text");
  }

  function adoptPasted(rows: PastedRow[], unread: string[], name: string) {
    const dateless = rows.filter((r) => !r.date).length;
    // b41 G-24: a missing date stays blank and must be set; never today's date by default.
    const fill = missingDate;
    setRowDates({});
    setPastedRows(rows);
    setMapping({ ...PASTE_COLUMN_MAP });
    setText(pastedRowsToCsv(withRowDates(rows, {}, fill)));
    setFileName(name);
    setPreview(null);
    setMessage("");
    setImportError("");
    setConsent(false);
    setAcknowledgeSkipped(false);
    setPasteNote(`${rows.length} trade${rows.length === 1 ? "" : "s"} read${name === "Pasted text" ? " from the text" : ` from ${name}`}${unread.length ? `; ${unread.length} part${unread.length === 1 ? "" : "s"} could not be read` : ""}. Review them below before anything is saved.${dateless ? ` Date missing on ${dateless} trade${dateless === 1 ? "" : "s"}: set each date below.` : ""}`);
  }

  function changeRowDate(index: number, value: string) {
    const next = { ...rowDates, [index]: value };
    setRowDates(next);
    setText(pastedRowsToCsv(withRowDates(pastedRows, next, missingDate)));
    setPreview(null);
  }

  function changeMissingDate(value: string) {
    setMissingDate(value);
    if (pastedRows.some((r) => !r.date)) {
      setText(pastedRowsToCsv(withRowDates(pastedRows, rowDates, value)));
      setPreview(null);
    }
  }

  async function postImport<T>(body: unknown): Promise<Awaited<ReturnType<typeof api.post<T>>>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        api.post<T>("/api/import", body, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("timeout"));
          }, IMPORT_WAIT_MS);
        }),
      ]);
    } catch (err) {
      const timedOut = controller.signal.aborted || (err instanceof Error && err.message === "timeout");
      if (timedOut) return { ok: false, error: IMPORT_TIMEOUT, aborted: true };
      return { ok: false, error: "The import did not finish. Refresh the book before you try again." };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function run(
    confirm: boolean,
    choice?: { fundBuys?: boolean; acknowledgeSkipped?: boolean; tickerFixes?: Record<string, string> }
  ) {
    const nextFund = choice && "fundBuys" in choice ? choice.fundBuys : fundBuys;
    const nextAck = choice && "acknowledgeSkipped" in choice ? choice.acknowledgeSkipped : acknowledgeSkipped;
    const fixes = choice?.tickerFixes || tickerFixes;
    setBusy(true);
    setMessage("");
    setImportError("");
    try {
      const res = await postImport<Preview>({
        text,
        confirm,
        acknowledgeSkipped: nextAck,
        fundBuys: nextFund,
        mapping: Object.values(mapping).some(Boolean) ? mapping : undefined,
        broker: brokerPick || undefined,
        tickerFixes: Object.keys(fixes).length ? fixes : undefined,
      });
      if (res.aborted) {
        setImportError(IMPORT_TIMEOUT);
        setPreview(null);
        return;
      }
      const columnMap = readImportPreview(res);
      if (columnMap) {
        const data = res.data;
        setPreview({
          broker: data?.broker || "generic",
          error: data?.error ?? null,
          headers: columnMap.headers,
          needsMapping: true,
          unreadable: data?.unreadable,
          unsupported: data?.unsupported || [],
          duplicateCount: data?.duplicateCount || 0,
          toWrite: data?.toWrite || [],
          fundingDeposits: data?.fundingDeposits || [],
          fundingNeeded: Boolean(data?.fundingNeeded),
          sourceTotals: data?.sourceTotals || {},
          importedTotals: data?.importedTotals || {},
          totalsMessage: data?.totalsMessage || "",
          written: data?.written,
          batchId: data?.batchId,
          summary: data?.summary,
          fifoNote: data?.fifoNote,
          detection: data?.detection,
          flagged: data?.flagged || [],
        });
        setMapping((current) => {
          if (Object.values(current).some(Boolean)) return current;
          const brokerName = data?.detection?.broker || data?.broker || "generic";
          const saved = typeof localStorage !== "undefined" ? readSavedColumnMap(localStorage, brokerName) : null;
          return saved || suggestedColumnMap(columnMap.headers);
        });
        return;
      }
      if (res.data) setPreview(res.data);
      if (!res.ok) {
        setImportError(typeof res.error === "string" ? res.error : "That file was not imported.");
        return;
      }
      if (confirm) {
        const saved = res.data?.summary
          ? res.data.summary
          : res.data?.written
            ? `${res.data.written} trade${res.data.written === 1 ? "" : "s"} saved.`
            : "No new trades were saved.";
        if (res.data?.batchId) {
          setResult({ written: res.data.written || 0, batchId: res.data.batchId, summary: saved });
        } else {
          setResult(null);
        }
        setText("");
        setFileName("");
        setPreview(null);
        setMapping({});
        setTickerFixes({});
        setConsent(false);
        setAcknowledgeSkipped(false);
        setFileKey((key) => key + 1);
        setMessage(saved);
        onImported?.();
      }
    } finally {
      setBusy(false);
    }
  }

  async function keepForSupport() {
    setBusy(true);
    setMessage("");
    setImportError("");
    try {
      const res = await postImport<{ kept: boolean; reason: string }>({
        action: "hold",
        text,
        consent,
      });
      if (res.aborted) {
        setImportError(IMPORT_TIMEOUT);
        return;
      }
      if (!res.ok) {
        setImportError(typeof res.error === "string" ? res.error : "The file was not kept.");
        return;
      }
      setMessage(res.data?.reason || "The file was kept for support.");
    } finally {
      setBusy(false);
    }
  }

  async function undoImport() {
    if (!result?.batchId) return;
    setBusy(true);
    setImportError("");
    try {
      const res = await postImport<{ undone: number; batchId: string }>({ action: "undo", batchId: result.batchId });
      if (!res.ok) {
        setImportError(typeof res.error === "string" ? res.error : "That import was not undone.");
        return;
      }
      const count = res.data?.undone ?? 0;
      setMessage(`Undone. ${count} row${count === 1 ? "" : "s"} removed and the cash put back.`);
      setResult(null);
      onImported?.();
    } finally {
      setBusy(false);
    }
  }

  const detectionLabel = preview?.detection?.label || (preview?.broker === "generic" ? "Generic" : preview?.broker || "");
  const detectionConfidence = preview?.detection?.confidence;

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-5xl px-4 py-10 sm:px-6"}>
      {embedded ? null : <p className="text-xs font-semibold uppercase tracking-wide text-primary">Paper book</p>}
      {embedded ? null : <h1 className="mt-2 font-display text-3xl font-bold">Import trades</h1>}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Upload a broker export (Hatch, Swyftx and IBKR layouts are checked against their published columns) or an AetherForge export, or map the columns
        yourself. Other layouts are read by column name, so check every row. Review the rows
        before anything is saved. A split, a dividend, or a row this page cannot read is listed and left
        out until you acknowledge it. A duplicate in this file, or a fill already on the book, is skipped.
        Nothing is saved before you confirm.
      </p>

      <form
        className="mt-8 space-y-4 rounded-2xl border border-border/70 bg-card/40 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(false);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="import-file">Trade file</Label>
          <input
            id="import-file"
            key={fileKey}
            type="file"
            accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
          <label className="mt-2 flex items-center gap-2 text-sm" htmlFor="import-broker">
            <span>Broker</span>
            <select
              id="import-broker"
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={brokerPick}
              onChange={(event) => {
                setBrokerPick(event.target.value === "investnow" ? "investnow" : "");
                setPreview(null);
              }}
            >
              <option value="">Detect from the file</option>
              <option value="investnow">InvestNow (Beta, layout not yet verified against a real export)</option>
            </select>
          </label>
          {brokerPick === "investnow" ? (
            <p className="text-xs text-muted-foreground" data-investnow-note>
              {/* BS-02; follow-up BS-02-VERIFY */}Beta, layout not yet verified against a real export. InvestNow .xlsx General Ledger Report or a CSV saved from it. Match the columns on the next step and check every row.
            </p>
          ) : null}
          {/* b40 G-24: embedded in the dashboard dialog, the dialog's own visible PasteTradesBox is used. */}
          {embedded ? null : (
          <details open className="mt-3 rounded-md border p-3" data-paste-import>
            <summary className="cursor-pointer text-sm font-semibold">Or paste email or contract-note text</summary>
            <textarea
              aria-label="Pasted trade text"
              className="mt-2 h-32 w-full rounded-md border bg-background p-2 text-sm"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Bought 25 FPH.NZ at NZ$28.50 on 13 Oct 2026. Brokerage: $5.00"
            />
            <button type="button" onClick={readPasted} className="mt-2 h-9 rounded-md border px-3 text-sm font-semibold">Read trades from text</button>
            {pasteNote ? <p className="mt-2 text-sm" role="status">{pasteNote}</p> : null}
            {pastedRows.some((r) => !r.date) ? (
              <div className="mt-2 space-y-1 text-sm" data-paste-date-missing>
                <label className="flex items-center gap-2">
                  <span className="font-medium text-rose-700">Date missing</span>
                  <input type="date" className="rounded border px-2 py-1" value={missingDate} onChange={(e) => changeMissingDate(e.target.value)} aria-label="Trade date for all rows with no date" />
                  <span className="text-xs text-muted-foreground">(all rows below unless set per row)</span>
                </label>
                <ul className="space-y-1" data-paste-row-dates>
                  {pastedRows.map((r, i) =>
                    r.date ? null : (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <span>
                          {r.type} {r.quantity} {r.ticker} @ {r.price}
                        </span>
                        <input
                          type="date"
                          className="rounded border px-2 py-1"
                          required
                          aria-required="true"
                          value={rowDates[i] || missingDate}
                          onChange={(e) => changeRowDate(i, e.target.value)}
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
          </details>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm" htmlFor="import-fund">
          <input
            id="import-fund"
            type="checkbox"
            className="mt-1"
            checked={fundBuys}
            onChange={(event) => {
              const next = event.target.checked;
              setFundBuys(next);
              setAcknowledgeSkipped(false);
              if (text.trim()) void run(false, { fundBuys: next, acknowledgeSkipped: false });
            }}
          />
          <span>
            Add paper deposits to fund buys
            <span className="mt-1 block text-muted-foreground">{FUNDING_DISCLOSURE}</span>
          </span>
        </label>
        {pastedDatesMissing ? (
          <p className="text-sm font-medium text-rose-700" role="alert" data-paste-dates-required>
            Set the date on {pastedDatesMissing} row{pastedDatesMissing === 1 ? "" : "s"} before review.
          </p>
        ) : null}
        <Button type="submit" disabled={busy || !text.trim() || pastedDatesMissing > 0}>
          {busy ? "Reading…" : "Review file"}
        </Button>
      </form>

      {preview?.needsMapping ? (
        <fieldset data-testid="column-map" className="mt-6 space-y-3 rounded-2xl border border-border/70 p-4">
          <legend className="px-1 font-display text-lg font-semibold">Match the columns</legend>
          <p data-testid="broker-detection" className="text-sm text-muted-foreground">
            {preview.detection?.label || "Generic"}
            {preview.detection?.confidence ? ` · ${preview.detection.confidence} confidence` : " · low confidence"}
          </p>
          <p className="text-sm text-muted-foreground">Nothing is saved until you review the file again.</p>
          {preview.error ? <p className="text-sm text-muted-foreground">{preview.error}</p> : null}
          {MAP_FIELDS.map(([key, label]) => (
            <div key={key} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-center">
              <Label htmlFor={`map-${key}`}>{label}</Label>
              <select
                id={`map-${key}`}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={mapping[key] || ""}
                onChange={(event) => {
                  const next = { ...mapping, [key]: event.target.value };
                  setMapping(next);
                  const brokerName = preview.detection?.broker || preview.broker || "generic";
                  if (typeof localStorage !== "undefined") writeSavedColumnMap(localStorage, brokerName, next);
                }}
              >
                <option value="">Not in this file</option>
                {preview.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </fieldset>
      ) : null}

      {preview && !preview.needsMapping ? (
        <section className="mt-8 space-y-3">
          <h2 className="font-display text-lg font-semibold">Review</h2>
          <p data-testid="broker-detection" className="text-sm text-muted-foreground">
            {detectionLabel || "Generic"}
            {detectionConfidence ? ` · ${detectionConfidence} confidence` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {preview.toWrite.length} to save. {preview.duplicateCount} already on the book.{" "}
            {preview.unsupported.length} left out.
          </p>
          {preview.error ? <p className="text-sm text-muted-foreground">{preview.error}</p> : null}
          {preview.totalsMessage ? <p className="text-sm text-muted-foreground">{preview.totalsMessage}</p> : null}
          {preview.fifoNote ? <p className="text-sm text-muted-foreground">{preview.fifoNote}</p> : null}
          <div className="overflow-x-auto rounded-2xl border border-border/70" data-testid="import-preview">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 font-medium">Side</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ticker</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Quantity</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Exchange rate</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Cash effect</th>
                  <th scope="col" className="px-3 py-2 font-medium">Warning</th>
                </tr>
              </thead>
              <tbody>
                {preview.toWrite.map((row) => (
                  <tr key={`${row.line}-${row.ticker}`} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{row.executedAt ? formatDisplayDateTime(row.executedAt) : formatDisplayDate(row.date)}</td>
                    <td className="px-3 py-2">{row.side}</td>
                    <td className="px-3 py-2">
                      {row.ticker}
                      {row.assetName && row.assetName !== row.ticker ? (
                        <span className="block text-xs text-muted-foreground">{row.assetName}</span>
                      ) : null}
                    </td>
                    <td className="tnum px-3 py-2 text-right">{row.quantity}</td>
                    <td className="tnum px-3 py-2 text-right">{formatUnitPrice(row.price, row.currency)}</td>
                    <td className="tnum px-3 py-2 text-right">
                      {formatFxInput(row.fx)}
                      <span className="block text-xs text-muted-foreground">{row.fxLabel}</span>
                    </td>
                    <td className="tnum px-3 py-2 text-right">
                      {row.nativeValue.toFixed(2)} {row.currency}
                    </td>
                    <td className="tnum px-3 py-2 text-right">{formatNzd(row.cashEffectNzd)}</td>
                    {oversells[row.line] ? (
                      <td className="px-3 py-2 text-rose-700" data-import-oversell>{oversells[row.line]}</td>
                    ) : (
                      <td className="px-3 py-2 text-muted-foreground">—</td>
                    )}
                  </tr>
                ))}
                {preview.unsupported
                  .filter((row) => row.ticker)
                  .map((row) => (
                    <tr key={`err-${row.line}-${row.ticker}`} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2">{row.date ? formatDisplayDate(row.date) : "—"}</td>
                      <td className="px-3 py-2">{row.side || "—"}</td>
                      <td className="px-3 py-2">{row.ticker}</td>
                      <td className="tnum px-3 py-2 text-right">{row.quantity ?? "—"}</td>
                      <td className="tnum px-3 py-2 text-right">{row.price != null && row.price > 0 ? formatUnitPrice(row.price, "USD") : "—"}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.reason}</td>
                    </tr>
                  ))}
                {(preview.flagged || []).map((row) => (
                  <tr key={`dup-${row.line}-${row.ticker}`} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{formatDisplayDate(row.date)}</td>
                    <td className="px-3 py-2">{row.side}</td>
                    <td className="px-3 py-2">{row.ticker}</td>
                    <td className="tnum px-3 py-2 text-right">{row.quantity}</td>
                    <td className="tnum px-3 py-2 text-right">{formatUnitPrice(row.price, row.currency)}</td>
                    <td className="tnum px-3 py-2 text-right">
                      {formatFxInput(row.fx)}
                      <span className="block text-xs text-muted-foreground">{row.fxLabel}</span>
                    </td>
                    <td className="tnum px-3 py-2 text-right">
                      {row.nativeValue.toFixed(2)} {row.currency}
                    </td>
                    <td className="tnum px-3 py-2 text-right">{formatNzd(row.cashEffectNzd)}</td>
                    <td className="px-3 py-2 text-muted-foreground">Duplicate. Skipped.</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.unsupported.length > 0 ? (
            <>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {preview.unsupported.map((row) => (
                  <li key={`${row.line}-${row.reason}`}>
                    Line {row.line}: {row.reason}
                    {row.ticker ? (
                      <span className="mt-1 block">
                        <label className="text-xs" htmlFor={`fix-${row.line}`}>
                          Ticker for line {row.line}
                        </label>
                        <input
                          id={`fix-${row.line}`}
                          className="ml-2 h-8 rounded-md border border-border bg-background px-2 text-sm"
                          defaultValue={tickerFixes[String(row.line)] || row.ticker}
                          aria-label={`Fix ticker on line ${row.line}`}
                          onBlur={(event) => {
                            const next = event.target.value.trim().toUpperCase();
                            if (!next) return;
                            const fixes = { ...tickerFixes, [String(row.line)]: next };
                            setTickerFixes(fixes);
                            void run(false, { tickerFixes: fixes });
                          }}
                        />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-sm" htmlFor="import-ack">
                <input
                  id="import-ack"
                  type="checkbox"
                  className="mt-1"
                  checked={acknowledgeSkipped}
                  onChange={(event) => setAcknowledgeSkipped(event.target.checked)}
                />
                <span>I have read the rows that will not be saved. They stay out of the book.</span>
              </label>
            </>
          ) : null}
          {oversellCount > 0 ? (
            <p role="alert" className="text-sm text-rose-700" data-import-oversell-block>
              {oversellCount === 1 ? "One sell is" : `${oversellCount} sells are`} more than you hold. Fix or remove{" "}
              {oversellCount === 1 ? "it" : "them"} before you confirm; nothing has been saved.
            </p>
          ) : null}
          <Button
            type="button"
            disabled={busy || oversellCount > 0 || preview.toWrite.length === 0 || (preview.unsupported.length > 0 && !acknowledgeSkipped)}
            onClick={() => void run(true)}
          >
            {busy ? "Saving…" : "Confirm"}
          </Button>
        </section>
      ) : null}

      {preview?.unreadable && preview.toWrite.length === 0 && !preview.needsMapping ? (
        <form
          className="mt-6 space-y-3 rounded-2xl border border-border/70 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void keepForSupport();
          }}
        >
          <h2 className="font-display text-lg font-semibold">Unrecognised file</h2>
          <label className="flex items-start gap-2 text-sm" htmlFor="import-consent">
            <input
              id="import-consent"
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Keep this file for support on this server process. It is not emailed. Leave this unticked and the
              file is dropped.
            </span>
          </label>
          <Button type="submit" variant="outline" disabled={busy}>
            Keep for support
          </Button>
        </form>
      ) : null}

      {importError ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {importError}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {result?.batchId ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-muted-foreground">Batch {result.batchId}. {result.summary}</p>
          <Button type="button" variant="outline" data-testid="import-undo" disabled={busy} onClick={() => void undoImport()}>
            Undo import
          </Button>
        </div>
      ) : null}
    </div>
  );
}
