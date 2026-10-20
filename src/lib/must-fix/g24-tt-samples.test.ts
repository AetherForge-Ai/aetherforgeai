import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePastedTrades, type PastedRow } from "@/lib/paste-import";

/** b41 G-24: TT's 20 synthetic paste samples (qa/fixtures/g24/samples.md), at least 19 of 20 exactly right. */
type Want = { type: string; ticker: string; qty: number | null; price: number; currency: string; date: string | null; fee: number | null; tax: number | null };

function parseExpected(rhs: string): Want {
  const [type, ticker, ...rest] = rhs.trim().split(/\s+/);
  const s = rest.join(" ");
  const qp = /^([\d.]+)\s+@([\d.]+)/.exec(s);
  const amt = /^([\d.]+)\s+(NZD|USD|AUD)/.exec(s);
  return {
    type,
    ticker,
    qty: qp ? Number(qp[1]) : null,
    price: qp ? Number(qp[2]) : Number(amt![1]),
    currency: /\b(NZD|USD|AUD)\b/.exec(s)![1],
    date: /\b(\d{4}-\d{2}-\d{2})\b/.exec(s)?.[1] ?? null,
    fee: /\bfee ([\d.]+)/.exec(s) ? Number(/\bfee ([\d.]+)/.exec(s)![1]) : null,
    tax: /\btax ([\d.]+)/.exec(s) ? Number(/\btax ([\d.]+)/.exec(s)![1]) : null,
  };
}

const md = readFileSync(join(process.cwd(), "qa/fixtures/g24/samples.md"), "utf8");
const samples = md
  .split("\n")
  .map((l) => /^(\d+)\.\s+"(.+)"(?:\s+\([^)]*\))?\s+->\s+(.+)$/.exec(l))
  .filter((m): m is RegExpExecArray => Boolean(m))
  .map((m) => ({ n: Number(m[1]), text: m[2], want: parseExpected(m[3]) }));

function matches(r: PastedRow | undefined, w: Want): boolean {
  if (!r) return false;
  return (
    r.type === w.type &&
    r.ticker === w.ticker &&
    (w.qty == null || r.quantity === w.qty) &&
    r.price === w.price &&
    r.currency === w.currency &&
    r.date === w.date &&
    (r.fees ?? null) === w.fee &&
    (r.tax ?? null) === w.tax
  );
}

describe("b41 G-24 TT samples", () => {
  it("reads all 20 samples from the fixture", () => expect(samples).toHaveLength(20));
  it("gets at least 19 of 20 exactly right", () => {
    const misses: string[] = [];
    for (const s of samples) {
      const { rows } = parsePastedTrades(s.text);
      if (!(rows.length === 1 && matches(rows[0], s.want))) misses.push(`#${s.n} ${JSON.stringify(rows)}`);
    }
    console.log(`G-24 TT samples: ${20 - misses.length}/20 correct${misses.length ? `\n${misses.join("\n")}` : ""}`);
    expect(20 - misses.length).toBeGreaterThanOrEqual(19);
  });
  it("all 20 pasted together give 20 rows, and the undated one stays blank", () => {
    const { rows } = parsePastedTrades(samples.map((s) => s.text).join("\n"));
    expect(rows).toHaveLength(20);
    expect(rows.find((r) => r.ticker === "CEN.NZ")?.date).toBeNull();
    expect(rows.filter((r) => r.date == null)).toHaveLength(1);
  });
});
