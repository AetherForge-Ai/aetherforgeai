// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createWorker } from "tesseract.js";
import data from "@/lib/import/fixtures/g24-visual/samples.json";
import manifest from "@/lib/import/fixtures/g24-visual/manifest.json";
import { createHash } from "node:crypto";
import { parsePastedTrades, type PastedRow } from "@/lib/paste-import";
import { imagePlacement, orderByPlacement, pdfBytesToText, pdfItemsToLines, rasterizePage, tidyOcrText, VISUAL_MAX_RASTER_PIXELS, VisualReadError, visualKindOf } from "@/lib/import/visual-reader";
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

function pdfDoc(objects: Buffer[]): Buffer {
  const out: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  let cursor = out[0].length;
  objects.forEach((body, index) => {
    offsets.push(cursor);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    out.push(chunk);
    cursor += chunk.length;
  });
  const xref = cursor;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) table += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out.push(Buffer.from(`${table}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(out);
}

function imagePagePdf(images: { jpeg: Buffer; w: number; h: number; a: number; b: number; c: number; d: number; e: number; f: number }[], text?: string): Buffer {
  const content = [
    text ? `BT /F1 12 Tf 20 40 Td (${text}) Tj ET\n` : "",
    ...images.map((image, index) => `q\n${image.a} ${image.b} ${image.c} ${image.d} ${image.e} ${image.f} cm\n/Im${index} Do\nQ\n`),
  ].join("");
  const contentBytes = Buffer.from(content);
  const font = text ? " /Font << /F1 5 0 R >>" : "";
  const xobjects = images.map((_, index) => `/Im${index} ${6 + index} 0 R`).join(" ");
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Count 1 /Kids [3 0 R] >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 800] /Contents 4 0 R /Resources <<${font} /XObject << ${xobjects} >> >> >>`),
    Buffer.concat([Buffer.from(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, Buffer.from("endstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    ...images.map((image) => Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.w} /Height ${image.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>\nstream\n`),
      image.jpeg,
      Buffer.from("\nendstream"),
    ])),
  ];
  return pdfDoc(objects);
}

function textPlusBlankPdf(): Buffer {
  const text = Buffer.from("BT /F1 12 Tf 20 40 Td (Bought 10 FPH.NZ) Tj ET\n");
  const empty = Buffer.from("");
  return pdfDoc([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 6 0 R >>"),
    Buffer.concat([Buffer.from(`<< /Length ${text.length} >>\nstream\n`), text, Buffer.from("endstream")]),
    Buffer.concat([Buffer.from(`<< /Length ${empty.length} >>\nstream\n`), empty, Buffer.from("endstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ]);
}

function mixedTwoPagePdf(jpeg: Buffer): Buffer {
  const text = Buffer.from("BT /F1 12 Tf 20 40 Td (Bought 10 FPH.NZ) Tj ET\n");
  const image = Buffer.from("q\n8 0 0 8 10 10 cm\n/Im0 Do\nQ\n");
  return pdfDoc([
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>"),
    Buffer.from("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 6 0 R /Resources << /XObject << /Im0 8 0 R >> >> >>"),
    Buffer.concat([Buffer.from(`<< /Length ${text.length} >>\nstream\n`), text, Buffer.from("endstream")]),
    Buffer.concat([Buffer.from(`<< /Length ${image.length} >>\nstream\n`), image, Buffer.from("endstream")]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      Buffer.from("\nendstream"),
    ]),
  ]);
}

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

  it("orders upright images from the top of the page, not by pixel area", () => {
    const smallOnTop = { name: "small", top: 740, left: 10, upright: true };
    const largeBelow = { name: "large", top: 110, left: 10, upright: true };
    expect(orderByPlacement([largeBelow, smallOnTop]).map((item) => item.name)).toEqual(["small", "large"]);
    expect(imagePlacement([8, 0, 0, 8, 10, 500])).toMatchObject({ upright: true, left: 10, top: 508 });
    expect(imagePlacement([0, 40, -40, 0, 50, 50]).upright).toBe(false);
    expect(() => orderByPlacement([{ upright: false, top: 1, left: 1 }])).toThrow(VisualReadError);
    expect(() => orderByPlacement([{ upright: true, top: 10, left: 10 }, { upright: true, top: 10, left: 10 }])).toThrow(/reading order/);
  });

  it("refuses a rotated image, a mixed PDF, and work past the bounds without OCR", async () => {
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAgACAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AL+AD//Z", "base64");
    const wide = Buffer.from("/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAACAEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAoAFAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ/AAAB//9k=", "base64");
    const widths: number[] = [];
    const recognize = async (image: Blob) => {
      const bytes = new Uint8Array(await image.arrayBuffer());
      widths.push(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16));
      return "ocr";
    };
    const ordered = await pdfBytesToText(imagePagePdf([
      { jpeg, w: 8, h: 8, a: 8, b: 0, c: 0, d: 8, e: 10, f: 500 },
      { jpeg: wide, w: 20, h: 10, a: 20, b: 0, c: 0, d: 10, e: 10, f: 100 },
    ]), undefined, recognize);
    expect(ordered).toBe("ocr\nocr");
    expect(widths).toEqual([8, 20]);
    await expect(pdfBytesToText(imagePagePdf([
      { jpeg, w: 8, h: 8, a: 0, b: 40, c: -40, d: 0, e: 50, f: 50 },
    ]), undefined, recognize)).rejects.toThrow(/rotated or mirrored/);
    expect(widths).toEqual([8, 20]);
    await expect(pdfBytesToText(new Uint8Array(mixedTwoPagePdf(jpeg)), undefined, recognize)).rejects.toThrow(/mixes typed pages and scanned pages/);
    const typedWithImage = await pdfBytesToText(new Uint8Array(imagePagePdf([
      { jpeg, w: 8, h: 8, a: 8, b: 0, c: 0, d: 8, e: 10, f: 10 },
    ], "Bought 10 FPH.NZ")), undefined, recognize);
    expect(typedWithImage).toContain("FPH.NZ");
    expect(widths).toEqual([8, 20]);
    let created = 0;
    let terminated = 0;
    await expect(pdfBytesToText(new Uint8Array(fs.readFileSync(path.join(FILES, "g24-scan-02.pdf"))), undefined, undefined, {
      maxPixels: 10,
      createWorker: async () => {
        created += 1;
        return { recognize: async () => ({ data: { text: "nope" } }), terminate: async () => { terminated += 1; } };
      },
    })).rejects.toThrow(/too large/);
    expect(created).toBe(0);
    const signal = new AbortController();
    signal.abort();
    await expect(pdfBytesToText(new Uint8Array(fs.readFileSync(path.join(FILES, "g24-scan-02.pdf"))), undefined, undefined, {
      signal: signal.signal,
      createWorker: async () => {
        created += 1;
        return { recognize: async () => ({ data: { text: "nope" } }), terminate: async () => { terminated += 1; } };
      },
    })).rejects.toThrow(/cancelled/);
    expect(created).toBe(0);
    let now = 0;
    await expect(pdfBytesToText(new Uint8Array(fs.readFileSync(path.join(FILES, "g24-scan-02.pdf"))), undefined, undefined, {
      now: () => now,
      deadlineMs: 5,
      createWorker: async () => {
        created += 1;
        now = 6;
        return { recognize: async () => ({ data: { text: "late" } }), terminate: async () => { terminated += 1; } };
      },
    })).rejects.toThrow(/too long/);
    expect(created).toBe(1);
    expect(terminated).toBe(1);
  });

  it("keeps a typed PDF that also has a blank page, and does not rasterize that page", async () => {
    let rasters = 0;
    const text = await pdfBytesToText(new Uint8Array(textPlusBlankPdf()), undefined, async () => "should-not-ocr", {
      rasterize: async () => {
        rasters += 1;
        return new Blob(["raster"]);
      },
    });
    expect(rasters).toBe(0);
    expect(text).toContain("FPH.NZ");
    expect(text).not.toContain("should-not-ocr");
  });

  it("draws a vector page through rasterizePage under the pixel cap, without a browser", async () => {
    const doc = {
      createElement() {
        const canvas = {
          width: 1,
          height: 1,
          getContext() {
            return { fillRect() {}, canvas };
          },
          toBlob(cb: (blob: Blob | null) => void) {
            cb(new Blob([`${canvas.width}x${canvas.height}`]));
          },
        };
        return canvas;
      },
    };
    const page = {
      getViewport({ scale }: { scale: number }) {
        return { width: 2000 * scale, height: 2000 * scale };
      },
      render({ canvas, viewport }: { canvas: { width: number; height: number; getContext: (kind: string, opts?: object) => { fillRect: () => void } }; viewport: { width: number; height: number } }) {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.getContext("2d", { alpha: false }).fillRect();
        return { promise: Promise.resolve() };
      },
    };
    const blob = await rasterizePage(page, doc as unknown as Document);
    expect(blob).toBeTruthy();
    const [width, height] = (await blob!.text()).split("x").map(Number);
    expect(width * height).toBeLessThanOrEqual(VISUAL_MAX_RASTER_PIXELS + width + height);
    expect(width).toBeLessThan(2000);
  });

  it("terminates the worker when cancel arrives during recognize", async () => {
    let terminated = 0;
    let release: (value: { data: { text: string } }) => void = () => undefined;
    const controller = new AbortController();
    const running = pdfBytesToText(new Uint8Array(fs.readFileSync(path.join(FILES, "g24-scan-02.pdf"))), undefined, undefined, {
      signal: controller.signal,
      createWorker: async () => ({
        recognize: () => new Promise((resolve) => {
          release = resolve;
          controller.abort();
        }),
        terminate: async () => {
          terminated += 1;
          release({ data: { text: "late" } });
        },
      }),
    });
    await expect(running).rejects.toThrow(/cancelled/);
    expect(terminated).toBeGreaterThan(0);
  });

  it("does not save a visual read before the explicit confirm control", () => {
    // Source inspection only. This is not a runtime proof that a click saved nothing.
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/import/BrokerImportPanel.tsx"), "utf8");
    const readVisual = src.slice(src.indexOf("async function readVisual"), src.indexOf("function adoptPasted"));
    expect(readVisual).toContain("readVisualFile");
    expect(readVisual).toContain("readPasted");
    expect(readVisual).not.toMatch(/postImport|api\.post|\brun\(/);
    expect(src).toContain('onClick={() => void run(true)}');
    expect(src).toContain("Nothing is saved before you confirm.");
    expect(src).toContain("visualAbort.current?.abort()");
    expect(src).toMatch(/useEffect\(\(\) => \(\) => \{\s*visualAbort\.current\?\.abort\(\);\s*\}, \[\]\)/);
  });
});
