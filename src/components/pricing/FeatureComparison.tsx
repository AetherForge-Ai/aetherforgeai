import { Fragment } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Detailed feature-comparison table for the pricing page.
 *
 * Static, server-rendered. Columns: Free · Starter · Pro · Ultimate.
 * A cell value is either a string (rendered as text), `true` (check),
 * or `false` (— / not included). Grouped by category for easy scanning;
 * horizontally scrollable on small screens.
 */

type Cell = string | boolean;
interface Row {
  label: string;
  cells: [Cell, Cell, Cell, Cell]; // free, starter, pro, ultimate
}
interface Group {
  title: string;
  rows: Row[];
}

const COLS = ["Free", "Starter", "Pro", "Ultimate"] as const;

const GROUPS: Group[] = [
  {
    title: "Portfolio & Tracking",
    rows: [
      { label: "Maximum holdings", cells: ["8", "25", "75", "Unlimited"] },
      { label: "Real-time P/L & allocation breakdown", cells: [true, true, true, true] },
      { label: "Multi-timeframe charts & top gainers", cells: ["Basic", true, true, true] },
      { label: "Data export (CSV)", cells: [false, true, true, true] },
    ],
  },
  {
    title: "AI Bots Access",
    rows: [
      { label: "Stox (NZX, ASX & Global Equities)", cells: ["Choose one", "Choose one", true, true] },
      { label: "Koins (Crypto Intelligence)", cells: ["Choose one", "Choose one", true, true] },
      { label: "The Headmaster · Portfolio Planning and Strategies", cells: [false, "Basic", true, true] },
    ],
  },
  {
    title: "AI Reports & Analysis",
    rows: [
      { label: "AI Research Reports per month", cells: ["3", "15", "Unlimited", "Unlimited"] },
      { label: "Strategy generation & simulation", cells: [false, "Basic", true, true] },
      { label: "Risk & stress testing", cells: [false, false, true, true] },
      { label: "Forward pathway projections", cells: ["Limited", true, true, true] },
    ],
  },
  {
    title: "Market Assistant",
    rows: [
      { label: "Query limits", cells: ["Limited", "Standard", "High", "Unlimited"] },
      { label: "Depth of analysis", cells: ["Basic", "Standard", "Advanced", "Institutional"] },
    ],
  },
  {
    title: "Advanced Features",
    rows: [
      { label: "API access", cells: [false, false, false, true] },
      { label: "Team / multiple users", cells: [false, false, false, "Up to 5"] },
      { label: "Custom reports & white labelling", cells: [false, false, false, true] },
      { label: "Priority support & dedicated manager", cells: [false, false, "Priority", "Dedicated"] },
    ],
  },
  {
    title: "Support & Extras",
    rows: [
      { label: "Report generation speed", cells: ["Standard", "Priority", "Fastest", "Fastest"] },
      { label: "Email support", cells: [true, true, true, true] },
      { label: "Priority processing", cells: [false, true, true, true] },
      { label: "Strategy consultation calls", cells: [false, false, false, true] },
    ],
  },
];

function CellValue({ value }: { value: Cell }) {
  if (value === true)
    return (
      <span className="inline-grid size-5 place-items-center rounded-full bg-primary/15 text-primary">
        <Check className="size-3" />
      </span>
    );
  if (value === false) return <Minus className="mx-auto size-4 text-muted-foreground/40" />;
  return <span className="text-xs font-medium text-foreground/80">{value}</span>;
}

export function FeatureComparison() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 text-center">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">Compare every plan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A full breakdown of what you unlock at each tier.
        </p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-border/70 bg-card/40">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70">
              <th className="sticky left-0 z-10 bg-card/80 px-5 py-4 text-left font-display text-sm font-bold backdrop-blur">
                Features
              </th>
              {COLS.map((c) => (
                <th
                  key={c}
                  className={cn(
                    "px-4 py-4 text-center font-display text-sm font-bold",
                    c === "Pro" && "text-primary"
                  )}
                >
                  {c}
                  {c === "Pro" && (
                    <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[0.58rem] font-bold uppercase text-primary">
                      Popular
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <Fragment key={group.title}>
                <tr className="bg-background/40">
                  <td
                    colSpan={5}
                    className="sticky left-0 px-5 py-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-primary/90"
                  >
                    {group.title}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.label} className="border-b border-border/40 last:border-0 hover:bg-primary/5">
                    <td className="sticky left-0 z-10 bg-card/40 px-5 py-3 text-left text-muted-foreground backdrop-blur">
                      {row.label}
                    </td>
                    {row.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-4 py-3 text-center",
                          COLS[i] === "Pro" && "bg-primary/[0.04]"
                        )}
                      >
                        <CellValue value={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
