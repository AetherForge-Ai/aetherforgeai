"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { formatNzd } from "@/lib/currency";
import { bytesTooLarge, IMPORT_TOO_LARGE } from "@/lib/import/limits";
import { isSpreadsheetName, workbookToCsv } from "@/lib/import/xlsx";
import { IbkrSyncPanel } from "@/components/import/IbkrSyncPanel";

interface RowNote {
  line: number;
  message: string;
}

interface PreviewRow {
  line: number;
  date: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  currency: string;
  fx: number;
  cashEffectNzd: number;
}

interface PreviewData {
  broker: string | null;
  label: string;
  headers: string[];
  needsMapping: boolean;
  suggested?: Record<string, string>;
  errors: RowNote[];
  skipped: RowNote[];
  toWrite: PreviewRow[];
  cashNzd: number;
  written?: number;
  batchId?: string;
  summary?: string;
  undone?: number;
}

const BATCH_KEY = "h10-import-batch";

const MAP_FIELDS = [
  ["date", "Date"],
  ["ticker", "Ticker"],
  ["side", "Side"],
  ["quantity", "Quantity"],
  ["price", "Price"],
  ["fee", "Fee"],
  ["currency", "Currency"],
  ["fx", "NZD rate"],
] as const;

export function ImportClient() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [saved, setSaved] = useState(false);
  const [batchReady, setBatchReady] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(BATCH_KEY);
    if (stored) setBatchId(stored);
    setBatchReady(true);
  }, []);

  useEffect(() => {
    if (!batchReady) return;
    if (batchId) window.sessionStorage.setItem(BATCH_KEY, batchId);
    else window.sessionStorage.removeItem(BATCH_KEY);
  }, [batchId, batchReady]);

  async function send(action: "preview" | "commit" | "undo", fileText = text, columnMap = mapping) {
    setBusy(true);
    setMessage("");
    const res = await api.post<PreviewData>("/api/import", {
      engine: "h10",
      action,
      text: fileText,
      mapping: columnMap,
      batchId: action === "undo" ? batchId : undefined,
    });
    setBusy(false);
    if (res.data && Array.isArray(res.data.toWrite)) setPreview(res.data);
    const savedBatch = res.data?.batchId;
    const written = res.data?.written ?? 0;
    if (action === "commit" && savedBatch && (res.ok || written > 0)) {
      setBatchId(savedBatch);
      setSaved(true);
    }
    if (action === "undo" && res.ok) {
      setBatchId("");
      setSaved(false);
      setPreview(null);
      setMessage(res.data?.undone ? `Undone ${res.data.undone} row${res.data.undone === 1 ? "" : "s"}. The totals are back to where they were.` : "Nothing was changed.");
      return;
    }
    if (!res.ok) {
      setMessage(typeof res.error === "string" ? res.error : "The import was not saved.");
      return;
    }
    if (res.data?.summary) setMessage(res.data.summary);
    else if (typeof res.error === "string" && res.error) setMessage(res.error);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPreview(null);
    setSaved(false);
    setMessage("");
    if (bytesTooLarge(file.size)) {
      setText("");
      setFileName(file.name);
      setMessage(IMPORT_TOO_LARGE);
      return;
    }
    let body: string;
    try {
      body = isSpreadsheetName(file.name) ? await workbookToCsv(await file.arrayBuffer()) : await file.text();
    } catch {
      setFileName(file.name);
      setMessage("That spreadsheet could not be read. Save it as CSV and try again.");
      return;
    }
    setText(body);
    setFileName(file.name);
    await send("preview", body);
  }

  const canSave = Boolean(preview && preview.toWrite.length > 0 && !preview.needsMapping && !saved);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-foreground">Import trades</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Upload a broker CSV or XLSX (for example a Stake Transaction Report, both tabs). Nothing is saved until you confirm the preview. A second upload of the same file is refused.
        Undo removes that whole import.
      </p>

      <IbkrSyncPanel />

      <label className="mt-6 block text-sm font-medium text-foreground" htmlFor="broker-csv">
        Broker CSV or XLSX
      </label>
      <input
        id="broker-csv"
        className="mt-2 block w-full text-sm"
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {fileName ? <p className="mt-2 text-sm text-muted-foreground">{fileName}</p> : null}

      {preview?.needsMapping ? (
        <fieldset className="mt-6 space-y-3" data-testid="column-map">
          <legend className="text-sm font-semibold text-foreground">Match the columns</legend>
          <p className="text-sm text-muted-foreground">This file is not a recognised broker export. Choose the columns, then preview again.</p>
          {MAP_FIELDS.map(([key, label]) => (
            <label key={key} className="grid grid-cols-[8rem_1fr] items-center gap-3 text-sm">
              <span>{label}</span>
              <select
                className="rounded-md border bg-background px-2 py-1"
                value={mapping[key] || preview.suggested?.[key] || ""}
                onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))}
              >
                <option value="">—</option>
                {preview.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={busy || !text}
            onClick={() => {
              const next = { ...(preview.suggested || {}) };
              for (const [key, value] of Object.entries(mapping)) next[key] = value;
              setMapping(next);
              void send("preview", text, next);
            }}
          >
            Preview these columns
          </Button>
        </fieldset>
      ) : null}

      {preview && !preview.needsMapping ? (
        <section className="mt-6" data-testid="import-preview" aria-live="polite">
          <h2 className="text-lg font-semibold text-foreground">{preview.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {preview.toWrite.length} trade{preview.toWrite.length === 1 ? "" : "s"} ready. Cash effect {formatNzd(preview.cashNzd)}.
          </p>
          {preview.toWrite.length ? (
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Line</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Side</th>
                  <th className="py-2 pr-3 font-medium">Ticker</th>
                  <th className="py-2 font-medium">NZ$</th>
                </tr>
              </thead>
              <tbody>
                {preview.toWrite.map((row) => (
                  <tr key={`${row.line}-${row.ticker}-${row.side}`} className="border-b border-border/60">
                    <td className="py-2 pr-3">{row.line}</td>
                    <td className="py-2 pr-3">{row.date}</td>
                    <td className="py-2 pr-3">{row.side}</td>
                    <td className="py-2 pr-3">{row.ticker}</td>
                    <td className="py-2">{formatNzd(row.cashEffectNzd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {preview.errors.length ? (
            <ul className="mt-4 space-y-1 text-sm text-destructive" data-testid="import-errors">
              {preview.errors.map((error) => (
                <li key={`${error.line}-${error.message}`}>{error.message}</li>
              ))}
            </ul>
          ) : null}
          {preview.skipped.length ? (
            <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
              {preview.skipped.map((row) => (
                <li key={`${row.line}-${row.message}`}>{row.message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {message ? (
        <p className="mt-4 text-sm text-foreground" role="status">
          {message}
        </p>
      ) : null}

      <div className="mt-6 flex gap-3">
        <Button type="button" disabled={!canSave || busy} onClick={() => void send("commit")}>
          Save these trades
        </Button>
        <Button type="button" variant="outline" disabled={!batchId || busy} onClick={() => void send("undo")}>
          Undo import
        </Button>
      </div>
    </div>
  );
}
