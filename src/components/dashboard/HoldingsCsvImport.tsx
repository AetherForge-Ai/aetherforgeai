"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { parseHoldingsCsv, type HoldingsCsvRow } from "@/lib/holdings-csv";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

function errorText(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  return "The server did not accept that row.";
}

function postRow(row: HoldingsCsvRow) {
  return api.post("/api/stocks", {
    ticker: row.ticker,
    asset_type: row.assetType,
    shares: row.units,
    purchase_price: row.pricePaid,
    purchase_date: row.date,
    execution_status: "filled",
    price_source: "broker_import",
    confirm: true,
  });
}

/**
 * Brings an existing book in. Columns are ticker, units and price paid.
 * A date is stored when the file has one. This is not a tax import.
 */
export function HoldingsCsvImport({
  assetType,
  onImported,
}: {
  assetType: "stock" | "crypto";
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const parsed = parseHoldingsCsv(await file.text());
      const rows = parsed.rows.filter((row) => row.assetType === assetType);
      const skipped = parsed.rows.length - rows.length;
      if (!rows.length) {
        toast.error(parsed.errors[0] || `No ${assetType === "crypto" ? "crypto" : "share"} rows in that file.`);
        return;
      }
      let saved = 0;
      const failures = [...parsed.errors];
      for (const row of rows) {
        const res = await postRow(row);
        if (res.ok) saved += 1;
        else failures.push(`${row.ticker}: ${errorText(res.error)}`);
      }
      if (saved) {
        toast.success(
          `Imported ${saved} ${assetType === "crypto" ? "coin" : "holding"}${saved === 1 ? "" : "s"}.`
        );
        onImported();
      }
      if (skipped) {
        failures.push(
          `${skipped} row${skipped === 1 ? "" : "s"} belonged to the other book and ${skipped === 1 ? "was" : "were"} left out.`
        );
      }
      if (failures.length) toast.error(failures.slice(0, 3).join(" "));
    } catch (err) {
      console.error("[holdings-csv] import failed", err);
      toast.error("That file could not be read.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label={`Import ${assetType} holdings from CSV`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Upload className="mr-1.5 size-3.5" />}
        Import CSV
      </Button>
    </>
  );
}
