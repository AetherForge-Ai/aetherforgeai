"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MISSING_MARK, type SnapshotFigure } from "@/lib/portfolio-snapshot";
import { cn } from "@/lib/utils";

export function mathsText(figure: SnapshotFigure): string {
  return [
    figure.maths.formula,
    ...figure.maths.inputs,
    figure.maths.arithmetic,
    `${figure.maths.source} · ${figure.maths.asOf}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Info button for one snapshot figure. Enter opens it. Escape closes it. */
export function ShowTheMaths({ figure, label }: { figure: SnapshotFigure; label: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const text = mathsText(figure);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Popover onOpenChange={() => setCopied("idle")}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
          aria-label={`Show the maths for ${label}`}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-left text-sm">
        <p className="font-medium">{figure.maths.formula}</p>
        {figure.maths.inputs.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            {figure.maths.inputs.map((input) => (
              <li key={input}>{input}</li>
            ))}
          </ul>
        ) : null}
        <p className="tnum font-mono text-xs">{figure.maths.arithmetic}</p>
        <p className="text-xs text-muted-foreground">
          {figure.maths.source} · {figure.maths.asOf}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied === "copied" ? "Copied" : copied === "failed" ? "Could not copy" : "Copy"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function FigureReadout({
  figure,
  label,
  signed = false,
  showReason = false,
  className,
  compact = false,
}: {
  figure: SnapshotFigure;
  label: string;
  signed?: boolean;
  showReason?: boolean;
  className?: string;
  /** Goal b13 M-6: the second figure in a table cell (e.g. return %) without arrow or maths button. */
  compact?: boolean;
}) {
  const missing = figure.display === MISSING_MARK;
  const up = !missing && figure.value != null && figure.value > 0;
  const down = !missing && figure.value != null && figure.value < 0;
  const text = !missing && signed && up && !figure.display.startsWith("+") ? `+${figure.display}` : figure.display;
  return (
    <span className={cn("inline-flex flex-col items-end gap-0.5", className)}>
      {/* b6 M-6: one line, tabular digits, and room between a price and its info icon. */}
      <span className="inline-flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
        {up && !compact ? <ArrowUp className="size-3 text-emerald-700" aria-hidden /> : null}
        {down && !compact ? <ArrowDown className="size-3 text-rose-600" aria-hidden /> : null}
        <span className={cn("tnum whitespace-nowrap tabular-nums", compact && up && "text-emerald-700", compact && down && "text-rose-600")} title={missing ? figure.reason || undefined : undefined}>
          {text}
          {missing && figure.reason ? <span className="sr-only"> {figure.reason}</span> : null}
        </span>
        {compact ? null : (
          <span className="ml-0.5 inline-flex shrink-0">
            <ShowTheMaths figure={figure} label={label} />
          </span>
        )}
      </span>
      {showReason && missing && figure.reason ? (
        <span className="max-w-[14rem] text-right text-[0.65rem] leading-snug font-normal text-muted-foreground">{figure.reason}</span>
      ) : null}
    </span>
  );
}
