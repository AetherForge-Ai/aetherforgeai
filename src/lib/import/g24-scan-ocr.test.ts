import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TESSERACT_CORE_PATH,
  VISUAL_MAX_RASTER_PIXELS,
  pdfBytesToText,
  rasterizePage,
  readVisualFile,
  tesseractCoreRequests,
} from "@/lib/import/visual-reader";

function fakePdf(pages: Array<{ text: string[]; paint?: boolean }>) {
  return {
    OPS: { paintImageXObject: 1, constructPath: 2 },
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (n: number) => ({
          getTextContent: async () => ({ items: pages[n - 1].text.map((str) => ({ str, transform: [1, 0, 0, 1, 0, 100] })) }),
          getOperatorList: async () => ({ fnArray: pages[n - 1].paint === false ? [] : [1], argsArray: [] }),
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
        destroy: async () => undefined,
      }),
    }),
  };
}

describe("G-24 scanned PDF and hosted tesseract core", () => {
  it("hosts every core file the worker config can request", () => {
    const names = tesseractCoreRequests(TESSERACT_CORE_PATH);
    expect(TESSERACT_CORE_PATH.endsWith(".js")).toBe(true);
    expect(names).toEqual(["tesseract-core-lstm.wasm.js"]);
    for (const name of names) {
      expect(readFileSync(path.join(process.cwd(), "public/import-reader/core", name)).byteLength).toBeGreaterThan(1000);
    }
  });

  it("OCRs a page whose text layer is empty and leaves a typed page alone", async () => {
    const calls: string[] = [];
    const scanned = await pdfBytesToText(new Uint8Array([1]), fakePdf([{ text: [], paint: true }]) as never, {
      rasterize: async () => new Blob(["png"]),
      recognize: async () => {
        calls.push("ocr");
        return "Bought 5 AIR.NZ";
      },
    });
    expect(scanned).toContain("Bought 5 AIR.NZ");
    expect(calls).toEqual(["ocr"]);
    let raster = 0;
    const typed = await pdfBytesToText(new Uint8Array([1]), fakePdf([{ text: ["Bought 1 FPH.NZ"], paint: true }]) as never, {
      rasterize: async () => {
        raster += 1;
        return new Blob(["png"]);
      },
      recognize: async () => "should-not-run",
    });
    expect(typed).toContain("Bought 1 FPH.NZ");
    expect(raster).toBe(0);
    let blankRaster = 0;
    const blank = await pdfBytesToText(new Uint8Array([1]), fakePdf([{ text: [], paint: false }]) as never, {
      rasterize: async () => {
        blankRaster += 1;
        return new Blob(["png"]);
      },
      recognize: async () => "should-not-run",
    });
    expect(blank).toBe("");
    expect(blankRaster).toBe(0);
  });

  it("refuses too many pages and caps a raster", async () => {
    await expect(pdfBytesToText(new Uint8Array([1]), fakePdf(Array.from({ length: 16 }, () => ({ text: ["x"] }))) as never)).rejects.toThrow(/too many pages/);
    let drawn = 0;
    const canvas = {
      width: 0,
      height: 0,
      toBlob: (cb: (blob: Blob | null) => void) => {
        drawn = canvas.width * canvas.height;
        cb(new Blob(["png"]));
      },
    };
    const doc = { createElement: () => canvas };
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 2000 * scale, height: 2000 * scale }),
      render: () => ({ promise: Promise.resolve() }),
    };
    await rasterizePage(page, doc as never);
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThanOrEqual(VISUAL_MAX_RASTER_PIXELS);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it("OCRs a form-XObject-wrapped image page", async () => {
    const calls: string[] = [];
    const pdf = {
      OPS: { paintFormXObject: 66, paintFormXObjectBegin: 74 },
      GlobalWorkerOptions: {},
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
            getOperatorList: async () => ({ fnArray: [74], argsArray: [] }),
            getViewport: () => ({ width: 10, height: 10 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
          destroy: async () => undefined,
        }),
      }),
    };
    const text = await pdfBytesToText(new Uint8Array([1]), pdf as never, {
      rasterize: async () => new Blob(["png"]),
      recognize: async () => {
        calls.push("ocr");
        return "Bought 2 FPH.NZ";
      },
    });
    expect(calls).toEqual(["ocr"]);
    expect(text).toContain("Bought 2 FPH.NZ");
    const named = await pdfBytesToText(new Uint8Array([1]), {
      ...pdf,
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
            getOperatorList: async () => ({ fnArray: [66], argsArray: [] }),
            getViewport: () => ({ width: 10, height: 10 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
          destroy: async () => undefined,
        }),
      }),
    } as never, {
      rasterize: async () => new Blob(["png"]),
      recognize: async () => "form name",
    });
    expect(named).toContain("form name");
  });

  it("stops recognize when the read budget runs out", async () => {
    const pending = pdfBytesToText(new Uint8Array([1]), fakePdf([{ text: [], paint: true }]) as never, {
      rasterize: async () => new Blob(["png"]),
      recognize: () => new Promise(() => undefined),
      deadlineMs: 20,
      now: () => 0,
    });
    await expect(pending).rejects.toThrow(/too long/);
  });

  it("cancel stops the read and saves nothing", async () => {
    const signal = AbortSignal.abort();
    const file = new File([new Uint8Array([1])], "scan.pdf", { type: "application/pdf" });
    const out = await readVisualFile(file, signal);
    expect(out).toEqual({ ok: false, error: "Reading was cancelled. Nothing was saved." });
    const panel = readFileSync("src/components/import/BrokerImportPanel.tsx", "utf8");
    const paste = readFileSync("src/components/import/PasteTradesBox.tsx", "utf8");
    expect(panel).toContain('data-read-cancel');
    expect(panel).toContain("Reading…");
    expect(paste).toContain('data-read-cancel');
    expect(panel).toContain("Nothing was saved");
  });
});
