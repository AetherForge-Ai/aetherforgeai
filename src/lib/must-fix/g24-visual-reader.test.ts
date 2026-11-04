// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createWorker } from "tesseract.js";
import data from "@/lib/import/fixtures/g24-visual/samples.json";
import { parsePastedTrades, type PastedRow } from "@/lib/paste-import";
import { pdfBytesToText, pdfItemsToLines, tidyOcrText, visualKindOf } from "@/lib/import/visual-reader";

/**
 * b97 G-24: the PDF/screenshot reader on the 20 synthetic samples, read from real
 * rendered PDF and PNG files by the same free, local libraries the app self-hosts
 * (pdf.js text layer, tesseract.js OCR with public/import-reader/lang). No network, no AI.
 */
type Want = { date: string; type: string; ticker: string; quantity: number; price: number; currency: string; fees: number; reference: string };
const samples = data.samples as { id: string; kind: "pdf" | "screenshot"; text: string; expected: Want[] }[];
const FILES = path.join(process.cwd(), "src/lib/import/fixtures/g24-visual/files");
const LANG = path.join(process.cwd(), "public/import-reader/lang");
const same = (g: PastedRow | undefined, w: Want) =>
  !!g && g.date === w.date && g.type === w.type && g.ticker === w.ticker && g.quantity === w.quantity && g.price === w.price && g.currency === w.currency && g.fees === w.fees && g.reference === w.reference;

describe("b97 G-24 visual reader", () => {
  it("accepts only PDFs and images", () => {
    expect(visualKindOf({ name: "a.pdf", type: "application/pdf" })).toBe("pdf");
    expect(visualKindOf({ name: "a.png", type: "image/png" })).toBe("image");
    expect(visualKindOf({ name: "a.csv", type: "text/csv" })).toBeNull();
  });

  it("joins pdf text items into lines top to bottom", () => {
    const lines = pdfItemsToLines([
      { str: "Sold", transform: [1, 0, 0, 1, 10, 100] },
      { str: " 5 AIR.NZ", transform: [1, 0, 0, 1, 40, 101] },
      { str: "Header", transform: [1, 0, 0, 1, 10, 200] },
    ]);
    expect(lines).toEqual(["Header", "Sold 5 AIR.NZ"]);
    expect(tidyOcrText("a  b\n\n\nc")).not.toContain("\n\n\n");
  });

  it("reads at least 95% of rows correctly from the real files, before anything is saved", async () => {
    const w = await createWorker("eng", 1, { langPath: LANG, cacheMethod: "none" });
    let ok = 0;
    let total = 0;
    const misses: string[] = [];
    try {
      for (const s of samples) {
        const text = s.kind === "pdf"
          ? await pdfBytesToText(new Uint8Array(fs.readFileSync(path.join(FILES, `${s.id}.pdf`))))
          : tidyOcrText((await w.recognize(path.join(FILES, `${s.id}.png`))).data.text);
        const { rows } = parsePastedTrades(text);
        s.expected.forEach((want, i) => {
          total++;
          if (same(rows[i], want)) ok++;
          else misses.push(`${s.id}#${i}`);
        });
      }
    } finally {
      await w.terminate();
    }
    console.log(`G-24 visual reader: ${ok}/${total} rows correct`, misses);
    expect(total).toBe(100);
    expect(ok / total).toBeGreaterThanOrEqual(0.95);
  }, 240_000);
});
