// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createWorker } from "tesseract.js";
import data from "@/lib/import/fixtures/g24-visual/samples.json";
import manifest from "@/lib/import/fixtures/g24-visual/manifest.json";
import { createHash } from "node:crypto";
import { parsePastedTrades, type PastedRow } from "@/lib/paste-import";
import { pdfBytesToText, pdfItemsToLines, tidyOcrText, visualKindOf } from "@/lib/import/visual-reader";
import os from "node:os";

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

  it("leaves a native-text PDF on its text layer", async () => {
    let calls = 0;
    const text = await pdfBytesToText(new Uint8Array(fs.readFileSync(path.join(FILES, "g24-01.pdf"))), undefined, async () => {
      calls += 1;
      return "should-not-ocr";
    });
    expect(calls).toBe(0);
    expect(text).toContain("Bought 10 FPH.NZ");
    expect(text).not.toContain("should-not-ocr");
  });

  it("reads an image-only PDF through the local OCR fallback into the review rows", async () => {
    const scanFile = fs.readFileSync(path.join(FILES, "g24-scan-02.pdf"));
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(scanFile), isEvalSupported: false }).promise;
    const items = (await (await doc.getPage(1)).getTextContent()).items.filter((item) => "str" in item && item.str.trim());
    expect(items).toHaveLength(0);
    await doc.destroy();

    const worker = await createWorker("eng", 1, { langPath: LANG, cacheMethod: "none" });
    const want = samples.find((s) => s.id === "g24-02")!.expected;
    try {
      const text = await pdfBytesToText(new Uint8Array(scanFile), undefined, async (image) => {
        const file = path.join(os.tmpdir(), `g24-scan-${process.pid}.png`);
        fs.writeFileSync(file, Buffer.from(await image.arrayBuffer()));
        try {
          return tidyOcrText((await worker.recognize(file)).data.text);
        } finally {
          fs.unlinkSync(file);
        }
      });
      const { rows } = parsePastedTrades(text);
      let ok = 0;
      const misses: string[] = [];
      want.forEach((row, i) => {
        if (same(rows[i], row)) ok += 1;
        else misses.push(`${i}`);
      });
      console.log(`G-24 image-only PDF: ${ok}/${want.length} rows correct`, misses);
      expect(ok / want.length).toBeGreaterThanOrEqual(0.95);
    } finally {
      await worker.terminate();
    }
  }, 120_000);

  it("manifest hashes and pdf classes match the files on disk", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const entries = [...manifest.selectedByExistingTest, manifest.addedImageOnlyPdf];
    for (const entry of entries) {
      const buf = fs.readFileSync(path.join(FILES, entry.file));
      expect(createHash("sha256").update(buf).digest("hex")).toBe(entry.sha256);
      expect(buf.length).toBe(entry.bytes);
      if (!entry.file.endsWith(".pdf")) continue;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
      let textItems = 0;
      let imageOps = 0;
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        textItems += (await page.getTextContent()).items.filter((item) => "str" in item && item.str.trim()).length;
        const ops = await page.getOperatorList();
        for (const fn of ops.fnArray) if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) imageOps += 1;
      }
      await doc.destroy();
      expect(textItems).toBe(entry.textItems);
      expect(imageOps).toBe(entry.imageOps);
      expect(entry.type).toBe(textItems > 0 ? "native-text-pdf" : "image-only-pdf");
    }
    expect(manifest.selectedByExistingTest.filter((s) => s.type === "native-text-pdf")).toHaveLength(10);
    expect(manifest.selectedByExistingTest.filter((s) => s.type === "png")).toHaveLength(10);
    expect(manifest.addedImageOnlyPdf.type).toBe("image-only-pdf");
    expect(manifest.expectedRowCount).toBe(100);
  });

  it("does not save a visual read before the explicit confirm control", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/import/BrokerImportPanel.tsx"), "utf8");
    const readVisual = src.slice(src.indexOf("async function readVisual"), src.indexOf("function adoptPasted"));
    expect(readVisual).toContain("readVisualFile");
    expect(readVisual).toContain("readPasted");
    expect(readVisual).not.toMatch(/postImport|api\.post|\brun\(/);
    expect(src).toContain('onClick={() => void run(true)}');
    expect(src).toContain("Nothing is saved before you confirm.");
  });
});
