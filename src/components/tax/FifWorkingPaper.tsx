"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatNzd, formatSignedMoney } from "@/lib/currency";
import type { FifPosition } from "@/lib/fif-working-paper";

function moneyOrBlank(value: number | null): string {
  if (value == null) return "Not recorded";
  return formatNzd(value);
}

function signedOrBlank(value: number | null): string {
  if (value == null) return "Not recorded";
  return formatSignedMoney(value);
}

function MarketFields({
  position,
  year,
  canSave,
}: {
  position: FifPosition;
  year: number;
  canSave: boolean;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(position.openingNzd == null ? "" : position.openingNzd.toFixed(2));
  const [closing, setClosing] = useState(position.closingNzd == null ? "" : position.closingNzd.toFixed(2));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function save() {
    const read = (text: string): number | null | undefined => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value < 0) return undefined;
      return value;
    };
    const openingValue = read(opening);
    const closingValue = read(closing);
    if (openingValue === undefined || closingValue === undefined) {
      setMessage("Enter a market value in NZ$, or leave the field blank.");
      return;
    }
    setPending(true);
    setMessage("");
    const res = await api.post("/api/tax/fif", {
      ticker: position.ticker,
      year,
      opening: openingValue,
      closing: closingValue,
    });
    setPending(false);
    if (!res.ok) {
      setMessage(typeof res.error === "string" ? res.error : "The market value was not saved.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <Label htmlFor={`${position.ticker}-open`}>Opening market value NZ$</Label>
        <Input
          id={`${position.ticker}-open`}
          inputMode="decimal"
          value={opening}
          onChange={(event) => setOpening(event.target.value)}
          disabled={!canSave || pending}
        />
      </div>
      <div>
        <Label htmlFor={`${position.ticker}-close`}>Closing market value NZ$</Label>
        <Input
          id={`${position.ticker}-close`}
          inputMode="decimal"
          value={closing}
          onChange={(event) => setClosing(event.target.value)}
          disabled={!canSave || pending}
        />
      </div>
      {canSave ? (
        <Button type="button" variant="outline" onClick={save} disabled={pending}>
          Save
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">There is no holding row to store a market value on.</p>
      )}
      {message ? <p className="text-sm text-muted-foreground sm:col-span-3">{message}</p> : null}
    </div>
  );
}

export function FifPositionCard({
  position,
  year,
  canSave,
}: {
  position: FifPosition;
  year: number;
  canSave: boolean;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-border/70 p-4">
      <h3 className="font-display text-base font-semibold">{position.ticker}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Cost basis {moneyOrBlank(position.costNzd)}. Opening market value {moneyOrBlank(position.openingNzd)}. Closing
        market value {moneyOrBlank(position.closingNzd)}.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Fair dividend rate {signedOrBlank(position.fdrNzd)}. Comparative value {signedOrBlank(position.cvNzd)}.
      </p>
      {position.omittedDividendCash ? (
        <p className="mt-2 text-sm text-muted-foreground">
          A dividend on this holding has no stored gross, so it is left out of gains.
        </p>
      ) : null}
      <MarketFields position={position} year={year} canSave={canSave} />
    </section>
  );
}
