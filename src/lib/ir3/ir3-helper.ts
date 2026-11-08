/**
 * G-31 (GOAL-LOCK row 67): IR3 helper. Shows which tax-pack figure goes where on the IR3.
 * Figures are read from the H-9 reports (taxableIncome, buildFifPaper, realisedByTaxYear); the only
 * steps here are IR461 selection rules (CV floor 0 / lower of FDR and CV) and the DTA credit cap.
 * Sums are in whole cents, half-up. Box numbers exist only for tax year 2026 (IR3 2026);
 * later years show item names only until IRD publishes a dated form.
 */
import { moneyCell, roundMoney } from "@/lib/currency";
import { csvEscape } from "@/lib/csv-cell";
import { fifClass, fifThresholdSentence, fifTotals, type FifPaper } from "@/lib/fif-working-paper";
import type { TaxableIncomeReport } from "@/lib/taxable-income";
import { foreignTaxCredit, individualFifIncome, jurisdictionOf, type FifMethod } from "./ir461";

export const IR3_LABEL = "Indicative, not tax advice";

export const IR3_SOURCES = [
  { href: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir1---ir99/ir3/ir3-2026.pdf", label: "IR3 2026 return (1 Apr 2025 to 31 Mar 2026), checked 20 Oct 2026" },
  { href: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir1---ir99/ir3g/ir3g-2026.pdf", label: "IR3G 2026 guide, Question 17 and IR1261, checked 20 Oct 2026" },
  { href: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir400---ir499/ir461/ir461.pdf", label: "IR461 Guide to foreign investment funds, April 2026, checked 20 Oct 2026" },
  { href: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir1000---ir1099/ir1071/ir1071.pdf", label: "IR1071 IR1261 FAQ, March 2025, checked 20 Oct 2026" },
] as const;

/** IR3 box ids by tax year ending. Only years with a dated IRD form are listed. */
export const IR3_BOXES: Readonly<Record<number, { overseasIncome: string; overseasTax: string }>> = {
  2026: { overseasIncome: "17B", overseasTax: "17A" },
};

export interface Ir1261Line {
  incomeType: string;
  jurisdiction: string;
  grossNzd: number | null;
  creditNzd: number | null;
  source: string;
  note?: string;
}

export interface Ir3Total {
  key: "overseas-income" | "overseas-tax";
  box: string | null;
  item: string;
  valueNzd: number | null;
}

export interface Ir3Helper {
  endingYear: number;
  label: string;
  boxesKnown: boolean;
  fifExempt: boolean;
  fifMethod: FifMethod | null;
  lines: Ir1261Line[];
  totals: Ir3Total[];
  notes: string[];
}

const cents = (v: number) => Math.round(roundMoney(v) * 100);

/** G-31: the IR461 quick sale adjustment inside FDR, named on the IR1261 FIF line. */
function qsNote(fif: FifPaper): string {
  const qs = fif.attributing.reduce((s, p) => s + cents(p.quickSaleNzd ?? 0), 0);
  return qs ? `FDR includes a quick sale adjustment of NZD ${moneyCell(qs / 100)} (IR461, April 2026). ` : "";
}

/** b90 H-9 (G13): top NZ individual rate, used to cap foreign tax credits when no marginal rate is given. */
export const IR3_DEFAULT_MARGINAL_RATE = 0.39;

export function buildIr3Helper(input: { income: TaxableIncomeReport; fif: FifPaper; marginalRate?: number | null }): Ir3Helper {
  const { income, fif } = input;
  const given = Number(input.marginalRate);
  const marginalRate = given > 0 && given < 1 ? given : IR3_DEFAULT_MARGINAL_RATE;
  const boxes = IR3_BOXES[income.endingYear] ?? null;
  const notes: string[] = [];
  const lines: Ir1261Line[] = [];
  // Overseas dividends by (bucket, jurisdiction).
  const divs = new Map<string, { g: number; w: number }>();
  let legacy = 0;
  for (const d of income.dividends) {
    const cls = fifClass(d.ticker, d.assetType);
    if (cls === "new-zealand" || cls === "not-a-share") continue;
    if (d.grossNzd == null) {
      legacy += 1;
      continue;
    }
    const key = `${cls}|${jurisdictionOf(d.ticker)}`;
    const cur = divs.get(key) ?? { g: 0, w: 0 };
    cur.g += cents(d.grossNzd);
    cur.w += cents(d.withholdingNzd ?? 0);
    divs.set(key, cur);
  }
  const unknownThreshold = fif.threshold === "unknown";
  const fifExempt = !unknownThreshold && (fif.threshold === "under" || fif.threshold === "at-limit" || fif.attributing.length === 0);
  let fifMethod: FifMethod | null = null;
  let blocked = false;

  if (unknownThreshold) {
    blocked = true;
    notes.push(fifThresholdSentence(fif));
  } else if (fifExempt) {
    if (fif.attributing.length) notes.push(`FIF exemption note: ${fifThresholdSentence(fif)} No FIF income figure is shown; dividends from these shares are listed as overseas dividends.`);
  } else {
    const t = fifTotals(fif.attributing);
    const pick = individualFifIncome(t.fdrNzd, t.cvNzd);
    let creditCents = 0;
    let creditUnknown = false;
    for (const [key, v] of divs) {
      if (!key.startsWith("attributable|")) continue;
      const fx = foreignTaxCredit({ jurisdiction: key.split("|")[1], grossNzd: v.g / 100, taxPaidNzd: v.w / 100 });
      if (fx == null && v.w > 0) creditUnknown = true;
      creditCents += fx == null ? 0 : cents(fx);
    }
    if (!pick) {
      blocked = true;
      notes.push("FIF income is blank because an opening market value or exchange rate is missing.");
    } else {
      fifMethod = pick.method;
      // b90 H-9 (G13): the credit cannot exceed the NZ tax on the FIF income (LJ 5).
      const nzTaxCents = cents(pick.incomeNzd * marginalRate);
      if (creditCents > nzTaxCents) {
        creditCents = Math.max(0, nzTaxCents);
        notes.push(`Foreign tax credit on FIF dividends is capped at the NZ tax on the FIF income (NZD ${moneyCell(nzTaxCents / 100)} at ${Math.round(marginalRate * 100)}%${input.marginalRate ? "" : ", the top individual rate; your rate may be lower"}).`);
      }
      lines.push({
        incomeType: "FIF income",
        jurisdiction: "overseas",
        grossNzd: pick.incomeNzd,
        creditNzd: creditCents / 100,
        source: pick.method === "CV" ? "FIF working paper: Total Comparative value NZD (floored at 0)" : "FIF working paper: Total FDR NZD",
        note: `${qsNote(fif)}Method ${pick.method} for the whole portfolio (lower of FDR ${moneyCell(t.fdrNzd ?? 0)} and CV${t.cvNzd == null ? " not calculated" : ` ${moneyCell(t.cvNzd)}`}; CV cannot go below 0). Dividends from these shares are not added again. Attach a per-FIF breakdown.`,
      });
      if (creditUnknown) notes.push("Some foreign tax on FIF dividends is from a country with no checked tax treaty rate, so no credit is claimed for it.");
    }
    notes.push(fifThresholdSentence(fif));
  }
  for (const [key, v] of [...divs].sort(([a], [b]) => a.localeCompare(b))) {
    const [cls, jur] = key.split("|");
    if (cls === "attributable" && !fifExempt) continue;
    const credit = foreignTaxCredit({ jurisdiction: jur, grossNzd: v.g / 100, taxPaidNzd: v.w / 100, nzTaxOnIncomeNzd: (v.g / 100) * marginalRate });
    lines.push({
      incomeType: cls === "australian" ? "Dividends (Australian listed, excluded from FIF)" : "Dividends",
      jurisdiction: jur,
      grossNzd: v.g / 100,
      creditNzd: credit ?? (v.w > 0 ? null : 0),
      source: "Income summary: Gross NZD and Withholding NZD (overseas rows)",
      note: credit == null && v.w > 0 ? "No checked tax treaty rate for this country: no credit shown." : "Credit capped at the treaty rate; also capped at the NZ tax on this income.",
    });
  }
  if (legacy) notes.push(`${legacy} overseas dividend row(s) have no stored gross or withholding and are left out.`);

  const sumG = lines.reduce((s, l) => s + cents(l.grossNzd ?? 0), 0);
  const sumC = lines.reduce((s, l) => s + cents(l.creditNzd ?? 0), 0);
  const totals: Ir3Total[] = [
    { key: "overseas-income", box: boxes?.overseasIncome ?? null, item: "Total overseas income", valueNzd: blocked ? null : sumG / 100 },
    { key: "overseas-tax", box: boxes?.overseasTax ?? null, item: "Total overseas tax paid", valueNzd: blocked ? null : sumC / 100 },
  ];
  if (boxes) notes.push("Box 17C stays unticked. Box 21B is your own total; this pack supplies 17B only.");
  else notes.push(`IR3 box numbers for the tax year ending 31 Mar ${income.endingYear} are not yet published by Inland Revenue, so only item names are shown.`);
  return { endingYear: income.endingYear, label: income.label, boxesKnown: !!boxes, fifExempt, fifMethod, lines, totals, notes };
}

const cell = (v: number | null) => (v == null ? "" : moneyCell(v));

export function ir3HelperCsv(h: Ir3Helper): string {
  const out = [[`IR3 helper - ${IR3_LABEL}`, "Income type", "Jurisdiction", "Gross NZD", "Tax credit NZD", "Source", "Note"].map(csvEscape).join(",")];
  for (const l of h.lines) out.push([h.label, l.incomeType, l.jurisdiction, cell(l.grossNzd), cell(l.creditNzd), l.source, l.note ?? ""].map(csvEscape).join(","));
  for (const t of h.totals) out.push([h.label, t.box ? `Box ${t.box} ${t.item}` : t.item, "", t.key === "overseas-income" ? cell(t.valueNzd) : "", t.key === "overseas-tax" ? cell(t.valueNzd) : "", "Sum of IR1261 lines", ""].map(csvEscape).join(","));
  for (const n of h.notes) out.push([h.label, "Note", "", "", "", "", n].map(csvEscape).join(","));
  for (const s of IR3_SOURCES) out.push([h.label, "Source", "", "", "", s.label, s.href].map(csvEscape).join(","));
  return out.join("\n");
}

export function ir3PaperLines(h: Ir3Helper): string[] {
  return [
    IR3_LABEL,
    "IR1261 lines (income type, jurisdiction, gross NZD, credit NZD):",
    ...(h.lines.length ? h.lines.map((l) => `  ${l.incomeType}, ${l.jurisdiction}, ${cell(l.grossNzd) || "blank"}, ${cell(l.creditNzd) || "blank"}`) : ["  none"]),
    ...h.totals.map((t) => `${t.box ? `Box ${t.box} ` : ""}${t.item}: NZD ${cell(t.valueNzd) || "not calculated"}`),
    ...h.notes,
    ...IR3_SOURCES.map((s) => `Source: ${s.label}`),
  ];
}
