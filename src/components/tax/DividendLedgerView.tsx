"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CsvExportButton } from "@/components/tax/CsvExportButton";
import { TaxSectionNav } from "@/components/tax/TaxSectionNav";
import { api } from "@/lib/api";
import { getActiveAccountUserId } from "@/lib/account-identity";
import { writeCachedCashNZD } from "@/lib/client-user-state";
import { currencyForTicker, formatDisplayDate, formatFxInput, formatNzd, type CurrencyCode } from "@/lib/currency";
import {
  buildDividendRecord,
  summariseDividends,
  type DividendView,
} from "@/lib/dividend-ledger";
import type { PaperHoldingChoice } from "@/lib/paper-holding";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";

function moneyCell(value: number | null): string {
  if (value == null) return "—";
  return formatNzd(value);
}

function holdingKey(row: PaperHoldingChoice): string {
  return `${row.assetType}:${row.ticker}`;
}

export function DividendLedgerView({
  signedIn,
  holdings,
  rows,
  readError,
  csvAllowed = false,
  taxYear,
}: {
  signedIn: boolean;
  holdings: PaperHoldingChoice[];
  rows: DividendView[];
  readError: boolean;
  csvAllowed?: boolean;
  taxYear: number;
}) {
  const router = useRouter();
  const [listed, setListed] = useState(rows);
  useEffect(() => {
    setListed(rows);
  }, [rows]);
  const totals = useMemo(() => summariseDividends(listed), [listed]);
  const [holdingKeyValue, setHoldingKeyValue] = useState("");
  const [date, setDate] = useState("");
  const [gross, setGross] = useState("");
  const [imputation, setImputation] = useState("");
  const [withholding, setWithholding] = useState("");
  const [drp, setDrp] = useState("");
  const [fx, setFx] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [message, setMessage] = useState("");

  const selected = holdings.find((row) => holdingKey(row) === holdingKeyValue) || null;
  const currency: CurrencyCode = selected ? currencyForTicker(selected.ticker, selected.assetType) : "NZD";
  const fxNumber = currency === "NZD" ? 1 : Number(fx);
  const preview =
    selected && gross.trim()
      ? buildDividendRecord({
          grossNative: Number(gross),
          imputationNzd: Number(imputation) || 0,
          withholdingNative: Number(withholding) || 0,
          drpNative: Number(drp) || 0,
          currency,
          fx: fxNumber,
        })
      : null;

  async function lookupRate() {
    if (!selected || currency === "NZD" || !date) return;
    setLookingUp(true);
    setMessage("");
    try {
      const res = await api.get<{ fx: string | null }>(
        `/api/tax/fx?currency=${currency}&date=${encodeURIComponent(date)}`
      );
      if (!res.ok || !res.data?.fx) {
        setMessage("No rate came back for that payment date. Enter the NZD rate.");
        return;
      }
      setFx(res.data.fx);
    } finally {
      setLookingUp(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !preview || preview.ok === false) {
      setMessage(preview && preview.ok === false ? preview.message : "Choose a holding and enter the gross dividend.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await api.post("/api/transactions", {
        type: "dividend",
        ticker: selected.ticker,
        asset_type: selected.assetType,
        asset_name: selected.name,
        executed_at: date,
        notes: note.trim() || undefined,
        dividend_gross: preview.parts.grossNative,
        dividend_imputation_nzd: preview.parts.imputationNzd,
        dividend_withholding: preview.parts.withholdingNative,
        dividend_drp: preview.parts.drpNative,
        fx_rate: preview.parts.fx,
        fx_source: currency === "NZD" ? "nzd" : "payment-date",
      });
      if (!res.ok) {
        setMessage(typeof res.error === "string" ? res.error : "That dividend was not saved.");
        return;
      }
      setGross("");
      setImputation("");
      setWithholding("");
      setDrp("");
      setNote("");
      const saved = res.data as { cashBalance?: number; lastTransaction?: { _id?: string } } | undefined;
      if (saved && typeof saved.cashBalance === "number") {
        writeCachedCashNZD(getActiveAccountUserId(), saved.cashBalance);
        window.dispatchEvent(new CustomEvent("aetherforge-book-changed", { detail: { cashBalance: saved.cashBalance } }));
      }
      setListed((current) => [
        {
          id: String(saved?.lastTransaction?._id || ""),
          when: date,
          ticker: selected.ticker,
          assetName: selected.name,
          assetType: selected.assetType,
          parts: preview.parts,
          cashNzd: preview.parts.netCashNzd,
        },
        ...current,
      ]);
      setMessage("Dividend recorded.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeDividend(id: string) {
    if (!id) return;
    setRemovingId(id);
    setMessage("");
    try {
      const res = await api.delete<{ cash?: { after?: number } }>(`/api/transactions?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setMessage(typeof res.error === "string" ? res.error : "That dividend was not removed.");
        return;
      }
      const after = res.data?.cash?.after;
      if (typeof after === "number") {
        writeCachedCashNZD(getActiveAccountUserId(), after);
        window.dispatchEvent(new CustomEvent("aetherforge-book-changed", { detail: { cashBalance: after } }));
      }
      setListed((current) => current.filter((row) => row.id !== id));
      setMessage("Dividend removed.");
      router.refresh();
    } finally {
      setRemovingId("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Dividend ledger</h1>
      <TaxSectionNav current="/tax/dividends" />
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Record a dividend on a holding you already have. Gross, NZ imputation credits, withholding and DRP
        reinvestment are stored in NZ$. A foreign payment uses the exchange rate on the payment date. Imputation
        credits are not cash. Net cash is gross minus withholding minus the DRP amount. DRP reinvestment does not
        change the share count. Record a buy if the quantity should increase.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Entered amounts are rounded to the cent, then converted at the payment-date rate.</li>
        <li>The rate is NZD for 1 unit of the holding currency, shown to 4 decimal places.</li>
        <li>A dividend saved before this breakdown shows its cash only. Missing figures stay blank.</li>
        <li>This page reads up to 5,000 dividend rows.</li>
      </ul>

      {signedIn ? (
        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-border/70 bg-card/40 p-4 print:hidden">
          <h2 className="font-display text-lg font-semibold">Record a dividend</h2>
          {holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No holding on this book yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dividend-holding">Holding</Label>
                <select
                  id="dividend-holding"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={holdingKeyValue}
                  onChange={(event) => {
                    setHoldingKeyValue(event.target.value);
                    setFx("");
                    setMessage("");
                  }}
                >
                  <option value="">Choose a holding</option>
                  {holdings.map((row) => (
                    <option key={holdingKey(row)} value={holdingKey(row)}>
                      {row.ticker}
                      {row.name && row.name !== row.ticker ? ` · ${row.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dividend-date">Payment date</Label>
                <Input id="dividend-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dividend-gross">Gross ({currency})</Label>
                <Input id="dividend-gross" inputMode="decimal" value={gross} onChange={(event) => setGross(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dividend-imputation">NZ imputation credits (NZ$)</Label>
                <Input
                  id="dividend-imputation"
                  inputMode="decimal"
                  value={imputation}
                  onChange={(event) => setImputation(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dividend-withholding">Withholding ({currency})</Label>
                <Input
                  id="dividend-withholding"
                  inputMode="decimal"
                  value={withholding}
                  onChange={(event) => setWithholding(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dividend-drp">DRP reinvestment ({currency})</Label>
                <Input id="dividend-drp" inputMode="decimal" value={drp} onChange={(event) => setDrp(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dividend-fx">Payment-date rate</Label>
                {currency === "NZD" ? (
                  <p id="dividend-fx" className="flex h-9 items-center text-sm">
                    1.0000 NZD
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      id="dividend-fx"
                      inputMode="decimal"
                      value={fx}
                      placeholder={`NZD per 1 ${currency}`}
                      onChange={(event) => setFx(event.target.value)}
                    />
                    <Button type="button" variant="outline" onClick={lookupRate} disabled={lookingUp || !date}>
                      {lookingUp ? "Looking up…" : "Use payment-date rate"}
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dividend-note">Note</Label>
                <Input id="dividend-note" value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
            </div>
          )}
          {preview && preview.ok ? (
            <p className="text-sm text-muted-foreground">
              Gross {formatNzd(preview.parts.grossNzd)}. Imputation credits {formatNzd(preview.parts.imputationNzd)}.
              Withholding {formatNzd(preview.parts.withholdingNzd)}. DRP {formatNzd(preview.parts.drpNzd)}. Net cash{" "}
              {formatNzd(preview.parts.netCashNzd)}. Payment-date rate {formatFxInput(preview.parts.fx)} NZD per 1{" "}
              {preview.parts.currency}
              {date ? ` on ${date}` : ""}. A buy on that day keeps the rate stored on the trade, which can differ.
            </p>
          ) : null}
          {/* pull-check:batch1-2026-10-11 R5 — the missing-rate error waits until lookup finishes. */}
          {preview && preview.ok === false && !lookingUp ? (
            <p className="text-sm text-rose-700">{preview.message}</p>
          ) : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          {holdings.length > 0 ? (
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record dividend"}
            </Button>
          ) : null}
        </form>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          <a className="text-primary underline-offset-4 hover:underline" href="/login?redirect=%2Ftax%2Fdividends">
            Sign in
          </a>{" "}
          to record a dividend on your paper book.
        </p>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Dividends on this book</h2>
          {signedIn ? (
            <div className="flex gap-2 print:hidden">
              <CsvExportButton href={`/api/tax/dividends/export?year=${taxYear}`} allowed={csvAllowed} />
              <Button type="button" variant="outline" onClick={() => window.print()}>
                Print
              </Button>
            </div>
          ) : null}
        </div>
        {readError ? (
          <p className="mt-3 text-sm text-muted-foreground">The dividend ledger could not be read.</p>
        ) : listed.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No dividends recorded.</p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Holding</th>
                    <th className="px-3 py-2 text-right font-medium">Gross</th>
                    <th className="px-3 py-2 text-right font-medium">Imputation credits</th>
                    <th className="px-3 py-2 text-right font-medium">Withholding</th>
                    <th className="px-3 py-2 text-right font-medium">DRP</th>
                    <th className="px-3 py-2 text-right font-medium">FX</th>
                    <th className="px-3 py-2 text-right font-medium">Net cash</th>
                    <th className="px-3 py-2 text-right font-medium print:hidden"> </th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((row, index) => (
                    <tr key={`${row.id || row.ticker}-${row.when}-${index}`} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2">{formatDisplayDate(row.when)}</td>
                      <td className="px-3 py-2">
                        {row.ticker || row.assetName || "—"}
                        {!row.parts ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Cash, no breakdown: {formatNzd(row.cashNzd)}. This cash is not added to gross.
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Payment-date rate {formatFxInput(row.parts.fx)}
                          </span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2 text-right">{moneyCell(row.parts ? row.parts.grossNzd : null)}</td>
                      <td className="tnum px-3 py-2 text-right">{moneyCell(row.parts ? row.parts.imputationNzd : null)}</td>
                      <td className="tnum px-3 py-2 text-right">{moneyCell(row.parts ? row.parts.withholdingNzd : null)}</td>
                      <td className="tnum px-3 py-2 text-right">{moneyCell(row.parts ? row.parts.drpNzd : null)}</td>
                      <td className="tnum px-3 py-2 text-right">{row.parts ? formatFxInput(row.parts.fx) : "—"}</td>
                      <td className="tnum px-3 py-2 text-right">{formatNzd(row.parts ? row.parts.netCashNzd : row.cashNzd)}</td>
                      <td className="px-3 py-2 text-right print:hidden">
                        {row.id ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:text-muted-foreground"
                            disabled={removingId === row.id}
                            onClick={() => void removeDividend(row.id)}
                          >
                            {removingId === row.id ? "Removing…" : "Delete"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/60 text-sm">
                    <td className="px-3 py-2 font-medium" colSpan={2}>
                      Combined
                    </td>
                    <td className="tnum px-3 py-2 text-right">{formatNzd(totals.grossNzd)}</td>
                    <td className="tnum px-3 py-2 text-right">{formatNzd(totals.imputationNzd)}</td>
                    <td className="tnum px-3 py-2 text-right">{formatNzd(totals.withholdingNzd)}</td>
                    <td className="tnum px-3 py-2 text-right">{formatNzd(totals.drpNzd)}</td>
                    <td className="px-3 py-2" />
                    <td className="tnum px-3 py-2 text-right">
                      {formatNzd(totals.netCashNzd + totals.legacyCashNzd)}
                    </td>
                    <td className="print:hidden" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Combined totals: gross {formatNzd(totals.grossNzd)}, imputation credits {formatNzd(totals.imputationNzd)},
              withholding {formatNzd(totals.withholdingNzd)}, DRP {formatNzd(totals.drpNzd)}, net cash{" "}
              {formatNzd(totals.netCashNzd)}.
              {totals.legacyCount > 0
                ? ` Cash, no breakdown: ${formatNzd(totals.legacyCashNzd)} on ${totals.legacyCount} row${totals.legacyCount === 1 ? "" : "s"}. That cash is not added to gross.`
                : ""}
            </p>
          </>
        )}
        <p className="mt-4 text-sm text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
      </section>
    </div>
  );
}
