"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { ImportPlan, ImportTrade } from "@/lib/broker-import";

type Preview = {
  broker: ImportPlan["broker"];
  error: string | null;
  headers: string[];
  needsMapping: boolean;
  unsupported: ImportPlan["unsupported"];
  duplicateCount: number;
  toWrite: ImportTrade[];
  fundingDeposits: ImportPlan["fundingDeposits"];
  fundingNeeded: boolean;
  sourceTotals: Record<string, number>;
  importedTotals: Record<string, number>;
  totalsMessage: string;
  written?: number;
};

const MAP_FIELDS = [
  ["date", "Date"],
  ["ticker", "Ticker"],
  ["side", "Side"],
  ["quantity", "Quantity"],
  ["price", "Price"],
  ["fee", "Fee"],
  ["currency", "Currency"],
  ["fx", "Exchange rate"],
  ["value", "Value"],
] as const;

export function BrokerImportPanel() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [acknowledgeSkipped, setAcknowledgeSkipped] = useState(false);
  const [fundBuys, setFundBuys] = useState<boolean | undefined>(undefined);

  async function readFile(file: File) {
    const body = await file.text();
    setText(body);
    setFileName(file.name);
    setPreview(null);
    setMessage("");
    setConsent(false);
    setAcknowledgeSkipped(false);
    setFundBuys(undefined);
  }

  async function run(confirm: boolean, choice?: { fundBuys?: boolean; acknowledgeSkipped?: boolean }) {
    const nextFund = choice && "fundBuys" in choice ? choice.fundBuys : fundBuys;
    const nextAck = choice && "acknowledgeSkipped" in choice ? choice.acknowledgeSkipped : acknowledgeSkipped;
    setBusy(true);
    setMessage("");
    try {
      const res = await api.post<Preview>("/api/import", {
        text,
        confirm,
        acknowledgeSkipped: nextAck,
        fundBuys: nextFund,
        mapping: Object.values(mapping).some(Boolean) ? mapping : undefined,
      });
      if (res.data) setPreview(res.data);
      if (!res.ok) {
        setMessage(typeof res.error === "string" ? res.error : "That file was not imported.");
        return;
      }
      if (confirm) {
        setMessage(
          res.data?.written
            ? `${res.data.written} trade${res.data.written === 1 ? "" : "s"} saved.`
            : "No new trades were saved."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function keepForSupport() {
    setBusy(true);
    setMessage("");
    try {
      const res = await api.post<{ kept: boolean; reason: string }>("/api/import", {
        action: "hold",
        text,
        consent,
      });
      setMessage(res.data?.reason || (typeof res.error === "string" ? res.error : "The file was not kept."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Paper book</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Import trades</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Upload a Sharesies, Hatch, or IBKR activity CSV, or map the columns yourself. Review the rows
        before anything is saved. A split, a dividend, or a row this page cannot read is listed and left
        out until you acknowledge it. Two identical fills in one file are both kept. A fill already saved
        on the book is not saved again.
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
            type="file"
            accept=".csv,text/csv,text/plain"
            className="block w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {fileName ? <p className="text-xs text-muted-foreground">{fileName}</p> : null}
        </div>
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy ? "Reading…" : "Review file"}
        </Button>
      </form>

      {preview?.needsMapping ? (
        <fieldset className="mt-6 space-y-3 rounded-2xl border border-border/70 p-4">
          <legend className="px-1 font-display text-lg font-semibold">Match the columns</legend>
          <p className="text-sm text-muted-foreground">Nothing is saved until you review the file again.</p>
          {MAP_FIELDS.map(([key, label]) => (
            <div key={key} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-center">
              <Label htmlFor={`map-${key}`}>{label}</Label>
              <select
                id={`map-${key}`}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={mapping[key] || ""}
                onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))}
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
          <h2 className="font-display text-lg font-semibold">
            Review {preview.broker ? `(${preview.broker})` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            {preview.toWrite.length} to save. {preview.duplicateCount} already on the book.{" "}
            {preview.unsupported.length} left out.
          </p>
          {preview.totalsMessage ? <p className="text-sm text-muted-foreground">{preview.totalsMessage}</p> : null}
          {preview.fundingNeeded || preview.fundingDeposits.length > 0 ? (
            <label className="flex items-start gap-2 text-sm" htmlFor="import-fund">
              <input
                id="import-fund"
                type="checkbox"
                className="mt-1"
                checked={preview.fundingDeposits.length > 0}
                onChange={(event) => {
                  const next = event.target.checked;
                  setFundBuys(next);
                  void run(false, { fundBuys: next });
                }}
              />
              <span>
                {preview.fundingDeposits[0]?.note ||
                  "Leave this off and a buy that would make paper cash negative is not saved. A paper deposit adds that amount to paper cash. It is not money from the broker file. XIRR counts a deposit as money you added, so the money-weighted return changes."}
              </span>
            </label>
          ) : null}
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium">Ticker</th>
                  <th className="px-3 py-2 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {preview.toWrite.map((row) => (
                  <tr key={`${row.line}-${row.ticker}`} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{row.side}</td>
                    <td className="px-3 py-2">{row.ticker}</td>
                    <td className="tnum px-3 py-2 text-right">{row.quantity}</td>
                    <td className="tnum px-3 py-2 text-right">{row.price.toFixed(2)}</td>
                    <td className="tnum px-3 py-2 text-right">
                      {row.nativeValue.toFixed(2)} {row.currency}
                    </td>
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
          <Button
            type="button"
            disabled={busy || preview.toWrite.length === 0 || (preview.unsupported.length > 0 && !acknowledgeSkipped)}
            onClick={() => void run(true)}
          >
            {busy ? "Saving…" : "Save reviewed trades"}
          </Button>
        </section>
      ) : null}

      {preview?.error && preview.toWrite.length === 0 && !preview.needsMapping ? (
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

      {message ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
